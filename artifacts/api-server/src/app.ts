import { join } from "node:path";
import express, { type Express, type ErrorRequestHandler } from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { CLERK_PROXY_PATH, clerkProxyMiddleware, getClerkProxyHost } from "./middlewares/clerkProxyMiddleware";
import { HttpError } from "./lib/http-error";

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
const frontend = process.env.BEAUTYHUB_FRONTEND_DIR;
if (frontend) {
  const assets = express.static(frontend, { index: false, redirect: false });
  app.use((req, res, next) => {
    if (/^\/api(?:\/|$)/.test(req.path)) { next(); return; }
    assets(req, res, next);
  });
  app.get(/^(?!\/api(?:\/|$)|\/assets(?:\/|$)).*/, (req, res, next) => {
    if (!req.accepts("html") || req.path.includes(".")) { next(); return; }
    res.set("Cache-Control", "no-cache").sendFile(join(frontend, "index.html"), (error) => {
      if (error) next(error);
    });
  });
}
app.use(helmet());
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);
app.use((req, res, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.get("origin");
    const parsedOrigin = origin && URL.canParse(origin) ? new URL(origin) : null;
    if (req.get("sec-fetch-site") === "cross-site" || (origin && (!parsedOrigin ||
        !["http:", "https:"].includes(parsedOrigin.protocol) || parsedOrigin.host !== getClerkProxyHost(req)))) {
      res.status(403).json({ error: "Anfrage von fremder Herkunft abgelehnt.", code: "FORBIDDEN" });
      return;
    }
  }
  next();
});
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
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message, code: error.code });
    return;
  }
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
