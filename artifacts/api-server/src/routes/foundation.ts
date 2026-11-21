import { Router, type IRouter } from "express";
import { GetSessionResponse, GetSystemStatusResponse } from "@workspace/api-zod";
import { foundation, guestSession } from "../lib/foundation";
import { requireAuthentication } from "../middlewares/authentication";

const router: IRouter = Router();
router.get("/system", (_req, res) => {
  res.json(GetSystemStatusResponse.parse(foundation));
});
router.get("/auth/session", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(GetSessionResponse.parse(guestSession));
});
router.use("/business", requireAuthentication);
router.use("/admin", requireAuthentication);
export default router;
