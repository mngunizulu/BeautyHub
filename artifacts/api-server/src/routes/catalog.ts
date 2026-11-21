import { Router, type IRouter } from "express";
import {
  ListBusinessesQueryParams, ListBusinessesResponse, GetBusinessParams,
  GetBusinessResponse, ListCategoriesResponse, GetMarketplaceSummaryResponse,
} from "@workspace/api-zod";
import { findPublicBusinesses, findPublicBusiness, findCategories, catalogSummary } from "../repositories/catalog";

const router: IRouter = Router();

router.get("/categories", async (_req, res): Promise<void> => {
  res.json(ListCategoriesResponse.parse(await findCategories()));
});

router.get("/businesses", async (req, res): Promise<void> => {
  const parsed = ListBusinessesQueryParams.strict().safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungültige Suchparameter.", code: "INVALID_INPUT" });
    return;
  }
  res.json(ListBusinessesResponse.parse(await findPublicBusinesses(parsed.data)));
});

router.get("/businesses/:slug", async (req, res): Promise<void> => {
  const parsed = GetBusinessParams.safeParse(req.params);
  if (!parsed.success) {
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

router.get("/marketplace/summary", async (_req, res): Promise<void> => {
  res.json(GetMarketplaceSummaryResponse.parse(await catalogSummary()));
});

export default router;
