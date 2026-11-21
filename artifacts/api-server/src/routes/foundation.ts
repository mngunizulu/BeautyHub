import { Router, type IRouter } from "express";
import { GetSessionResponse, GetSystemStatusResponse } from "@workspace/api-zod";
import { foundation, guestSession } from "../lib/foundation";
import { requireAuthentication, loadIdentity } from "../middlewares/authentication";
import { publicProfile } from "../services/identity";

const router: IRouter = Router();
router.get("/system", (_req, res) => {
  res.json(GetSystemStatusResponse.parse(foundation));
});
router.get("/auth/session", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const user = await loadIdentity(req);
  res.json(GetSessionResponse.parse(user
    ? { authenticated: true, configured: true, provider: "clerk", role: "consumer", message: "Angemeldet", user: publicProfile(user) }
    : guestSession));
});
router.use("/business", requireAuthentication);
router.use("/admin", requireAuthentication);
router.use("/admin", (req, res, next) => {
  if (!req.identity?.isPlatformAdmin) { res.status(403).json({ error: "Administratorzugriff erforderlich.", code: "FORBIDDEN" }); return; }
  next();
});
export default router;
