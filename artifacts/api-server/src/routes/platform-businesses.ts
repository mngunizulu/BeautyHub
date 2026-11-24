import { Router, type IRouter } from "express";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { auditEvents, db, locations, organizations } from "@workspace/db";
import { HttpError } from "../lib/http-error";
import { input, uuid } from "../lib/input";

export const platformBusinessesRouter: IRouter = Router();
// Foundation authentication and platform-role middleware protects this prefix.
const path = "/admin/businesses";
const fields = {
  id: organizations.id, name: organizations.name,
  verifiedAt: organizations.verifiedAt, suspendedAt: organizations.suspendedAt,
};

platformBusinessesRouter.get(path, async (req, res) => {
  const { search, offset } = input(z.strictObject({
    search: z.string().trim().max(120).default(""), offset: z.coerce.number().int().min(0).max(1000000).default(0),
  }), req.query);
  const rows = await db.select({ ...fields, locationCount: db.$count(locations, eq(locations.organizationId, organizations.id)) })
    .from(organizations).where(search ? sql`strpos(lower(${organizations.name}), lower(${search})) > 0` : undefined)
    .orderBy(asc(organizations.name), asc(organizations.id)).limit(21).offset(offset);
  res.json({ businesses: rows.slice(0, 20), hasMore: rows.length > 20 });
});

platformBusinessesRouter.put(path + "/:id", async (req, res) => {
  const id = uuid(req.params.id);
  const { action } = input(z.strictObject({
    action: z.enum(["verify", "unverify", "suspend", "reactivate"]),
  }), req.body);
  const updated = await db.transaction(async (tx) => {
    const [current] = await tx.select(fields).from(organizations).where(eq(organizations.id, id)).for("update");
    if (!current) throw new HttpError(404, "Unternehmen nicht gefunden.");
    const now = sql`clock_timestamp()`;
    const changes = {
      verify: current.verifiedAt ? undefined : { verifiedAt: now },
      unverify: current.verifiedAt ? { verifiedAt: null } : undefined,
      suspend: current.suspendedAt ? undefined : { suspendedAt: now },
      reactivate: current.suspendedAt ? { suspendedAt: null } : undefined,
    }[action];
    if (!changes) return current;
    const [next] = await tx.update(organizations).set(changes).where(eq(organizations.id, id)).returning(fields);
    await tx.insert(auditEvents).values({ organizationId: id, actorId: req.identity!.id,
      targetId: id, action: "platform.business." + action });
    return next;
  });
  res.json(updated);
});
