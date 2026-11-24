import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { findBusinessesWithAvailability } from "../services/marketplace-availability";
import {
  ListBusinessesQueryParams, ListBusinessesResponse, GetBusinessParams,
  GetBusinessResponse, ListCategoriesResponse, GetMarketplaceSummaryResponse,
} from "@workspace/api-zod";
import { findPublicBusinesses, findPublicBusiness, findPublicReviews, findCategories, catalogSummary } from "../repositories/catalog";

const router: IRouter = Router();

router.get("/categories", async (_req, res): Promise<void> => {
  res.json(ListCategoriesResponse.parse(await findCategories()));
});

router.get("/businesses", async (req, res): Promise<void> => {
  const parsed = ListBusinessesQueryParams.strict().safeParse(req.query);
  const maxPrice = req.query.maxPriceCents;
  if (!parsed.success || (maxPrice !== undefined && (typeof maxPrice !== "string" || !/^\d+$/.test(maxPrice)))) {
    res.status(400).json({ error: "Ungültige Suchparameter.", code: "INVALID_INPUT" });
    return;
  }
  const { date, ...filters } = parsed.data;
  if (date !== undefined && (typeof req.query.date !== "string" || !z.iso.date().safeParse(date).success)) {
    res.status(400).json({ error: "Ungültiges Buchungsdatum.", code: "INVALID_INPUT" });
    return;
  }
  res.json(ListBusinessesResponse.parse(date ? await findBusinessesWithAvailability(filters, date) : await findPublicBusinesses(filters)));
});

router.get("/businesses/:slug", async (req, res): Promise<void> => {
  const parsed = GetBusinessParams.safeParse(req.params);
  const maxPrice = req.query.maxPriceCents;
  if (!parsed.success || (maxPrice !== undefined && (typeof maxPrice !== "string" || !/^\d+$/.test(maxPrice)))) {
    res.status(400).json({ error: "Ungültige Profiladresse.", code: "INVALID_INPUT" });
    return;
  }
  const business = await findPublicBusiness(parsed.data.slug);
  if (!business) {
    res.status(404).json({ error: "Dieses Studio wurde nicht gefunden.", code: "NOT_FOUND" });
    return;
  }
  res.json(GetBusinessResponse.parse(business));
});

router.get("/businesses/:slug/reviews", async (req, res) => {
  const params = GetBusinessParams.safeParse(req.params);
  const query = z.strictObject({
    sort: z.enum(["newest", "highest", "lowest"]).default("newest"),
    offset: z.string().regex(/^\d{1,5}$/).default("0").transform(Number),
  }).safeParse(req.query);
  if (!params.success || !query.success) {
    res.status(400).json({ error: "Ungültige Bewertungsabfrage.", code: "INVALID_INPUT" });
    return;
  }
  const result = await findPublicReviews(params.data.slug, query.data.sort, query.data.offset);
  if (!result) {
    res.status(404).json({ error: "Dieses Studio wurde nicht gefunden.", code: "NOT_FOUND" });
    return;
  }
  res.json(result);
});

router.get("/marketplace/summary", async (_req, res): Promise<void> => {
  res.json(GetMarketplaceSummaryResponse.parse(await catalogSummary()));
});

export default router;
