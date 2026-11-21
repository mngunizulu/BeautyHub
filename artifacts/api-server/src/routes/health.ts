import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", async (req, res): Promise<void> => {
  try {
    await pool.query("select 1");
    res.json(HealthCheckResponse.parse({
      status: "ok", database: "connected", timestamp: new Date().toISOString(), version: "0.1.0",
    }));
  } catch {
    req.log.error("Database readiness check failed");
    res.status(503).json(HealthCheckResponse.parse({
      status: "degraded", database: "unavailable", timestamp: new Date().toISOString(), version: "0.1.0",
    }));
  }
});

export default router;
