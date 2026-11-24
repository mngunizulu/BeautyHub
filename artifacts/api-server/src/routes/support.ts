import { Router, type IRouter } from "express";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db, supportCases, supportMessages } from "@workspace/db";
import { HttpError } from "../lib/http-error";
import { input, uuid } from "../lib/input";
import { requirePlatformIntake } from "../services/platform-settings";
import { requireAuthentication } from "../middlewares/authentication";

export const supportRouter: IRouter = Router();
const customerPath = "/me/support-cases";
// The foundation router applies platform authorization to /admin before this router.
const adminPath = "/admin/support-cases";
const submission = z.strictObject({ body: z.string().trim().min(1).max(4000), requestId: z.uuid() });
const conflict = () => new HttpError(409, "Dieser Sendeschlüssel wurde bereits verwendet.");
const paging = z.object({ offset: z.coerce.number().int().min(0).max(1000000).default(0) });
const state = z.enum(["open", "resolved"]);
const fields = { id: supportCases.id, subject: supportCases.subject, state: supportCases.state, updatedAt: supportCases.updatedAt };
const missing = () => new HttpError(404, "Anfrage nicht gefunden.");

supportRouter.use(customerPath, requireAuthentication);

for (const [path, platform] of [[customerPath, false], [adminPath, true]] as const) {
  supportRouter.get(path, async (req, res) => {
    const query = input(paging.extend({ state: state.optional() }).strict(), req.query);
    const rows = await db.select(fields).from(supportCases).where(and(
      platform ? undefined : eq(supportCases.customerId, req.identity!.id),
      query.state ? eq(supportCases.state, query.state) : undefined,
    )).orderBy(desc(supportCases.updatedAt), asc(supportCases.id)).limit(21).offset(query.offset);
    res.json({ cases: rows.slice(0, 20), hasMore: rows.length > 20 });
  });

  supportRouter.get(path + "/:id", async (req, res) => {
    const id = uuid(req.params.id);
    const { offset } = input(paging.strict(), req.query);
    const result = await db.transaction(async (tx) => {
      const [entry] = await tx.select(fields).from(supportCases).where(and(eq(supportCases.id, id),
        platform ? undefined : eq(supportCases.customerId, req.identity!.id)));
      if (!entry) throw missing();
      const rows = await tx.select({
        id: supportMessages.id, kind: supportMessages.kind, body: supportMessages.body, createdAt: supportMessages.createdAt,
      }).from(supportMessages).where(eq(supportMessages.caseId, id))
        .orderBy(desc(supportMessages.createdAt), desc(supportMessages.id)).limit(51).offset(offset);
      return { ...entry, messages: rows.slice(0, 50).reverse(), hasOlder: rows.length > 50 };
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
    res.json(result);
  });

  supportRouter.post(path + "/:id/messages", async (req, res) => {
    const id = uuid(req.params.id);
    const { body, requestId } = input(submission, req.body);
    await db.transaction(async (tx) => {
      const [entry] = await tx.select({ state: supportCases.state }).from(supportCases).where(and(
        eq(supportCases.id, id), platform ? undefined : eq(supportCases.customerId, req.identity!.id),
      )).for("update");
      if (!entry) throw missing();
      const [prior] = await tx.select().from(supportMessages).where(eq(supportMessages.id, requestId));
      if (prior) {
        if (prior.caseId !== id || prior.actorId !== req.identity!.id || prior.body !== body ||
            prior.kind !== (platform ? "staff" : "customer")) throw conflict();
        return;
      }
      if (entry.state !== "open") throw new HttpError(409, "Diese Anfrage ist geschlossen.");
      const [sent] = await tx.insert(supportMessages).values({ id: requestId, caseId: id, body, kind: platform ? "staff" : "customer",
        actorId: req.identity!.id, createdAt: sql`clock_timestamp()` }).onConflictDoNothing().returning({ id: supportMessages.id });
      if (!sent) throw conflict();
      await tx.update(supportCases).set({ updatedAt: sql`clock_timestamp()` }).where(eq(supportCases.id, id));
    });
    res.status(204).end();
  });
}

supportRouter.post(customerPath, async (req, res) => {
  const { subject, body, requestId } = input(submission.extend({ subject: z.string().trim().min(1).max(120) }), req.body);
  const actorId = req.identity!.id;
  const entry = await db.transaction(async (tx) => {
    const [created] = await tx.insert(supportCases).values({ id: requestId, subject, customerId: actorId })
      .onConflictDoNothing().returning(fields);
    if (created) {
      await requirePlatformIntake(tx, "supportIntakeOpen");
      await tx.insert(supportMessages).values({ caseId: created.id, actorId, kind: "customer", body });
      return { data: created, status: 201 };
    }
    const [prior] = await tx.select(fields).from(supportCases)
      .where(and(eq(supportCases.id, requestId), eq(supportCases.customerId, actorId)));
    if (!prior || prior.subject !== subject) throw conflict();
    const [original] = await tx.select({ body: supportMessages.body }).from(supportMessages)
      .where(eq(supportMessages.caseId, requestId)).orderBy(asc(supportMessages.createdAt), asc(supportMessages.id)).limit(1);
    if (original?.body !== body) throw conflict();
    return { data: prior, status: 200 };
  });
  res.status(entry.status).json(entry.data);
});

supportRouter.put(adminPath + "/:id/state", async (req, res) => {
  const id = uuid(req.params.id);
  const { state: next } = input(z.strictObject({ state }), req.body);
  await db.transaction(async (tx) => {
    const [entry] = await tx.select({ state: supportCases.state }).from(supportCases).where(eq(supportCases.id, id)).for("update");
    if (!entry) throw missing();
    if (entry.state === next) return;
    await tx.update(supportCases).set({ state: next, updatedAt: sql`clock_timestamp()` }).where(eq(supportCases.id, id));
    await tx.insert(supportMessages).values({ caseId: id, actorId: req.identity!.id, kind: next === "resolved" ? "resolved" : "reopened",
      body: "", createdAt: sql`clock_timestamp()` });
  });
  res.status(204).end();
});
