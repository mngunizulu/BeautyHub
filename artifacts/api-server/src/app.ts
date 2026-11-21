import express, { type Express, type ErrorRequestHandler } from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();
app.disable("x-powered-by");
// The app is behind one trusted ingress; never blindly trust arbitrary proxy chains.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(helmet());
app.use(express.json({ limit: "32kb" }));
app.use(express.urlencoded({ extended: false, limit: "32kb" }));
app.use("/api", rateLimit({
  windowMs: 60_000,
  limit: 240,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Zu viele Anfragen. Bitte später erneut versuchen.", code: "RATE_LIMITED" },
}));

app.use("/api", router);
app.use((_req, res) => {
  res.status(404).json({ error: "Endpunkt nicht gefunden.", code: "NOT_FOUND" });
});
const handleError: ErrorRequestHandler = (error: unknown, req, res, _next) => {
  const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 500;
  if (status === 400 || status === 413) {
    res.status(status).json({ error: "Ungültige oder zu große Anfrage.", code: "INVALID_INPUT" });
    return;
  }
  // Never put request bodies, credentials or raw database errors in the response.
  req.log.error("Request failed; internal details withheld");
  res.status(500).json({ error: "Die Anfrage konnte nicht verarbeitet werden.", code: "INTERNAL_ERROR" });
};
app.use(handleError);

export default app;
