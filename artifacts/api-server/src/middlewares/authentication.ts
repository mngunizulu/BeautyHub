import type { RequestHandler } from "express";

// Deliberately fail closed until managed identity verification is wired in Stage 2.
// No header, cookie, user ID, role, or tenant parameter can impersonate an account.
export const requireAuthentication: RequestHandler = (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(401).json({
    error: "Bitte anmelden. Die Kontoaktivierung folgt in Entwicklungsstufe 2.",
    code: "AUTHENTICATION_REQUIRED",
  });
};
