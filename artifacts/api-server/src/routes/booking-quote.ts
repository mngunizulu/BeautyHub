import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { QuoteBookingBody, QuoteBookingParams } from "@workspace/api-zod";
import { input } from "../lib/input";

import { quoteSelection } from "../services/booking-quote";

export const bookingQuoteRouter: IRouter = Router();
bookingQuoteRouter.post("/businesses/:slug/booking-quote", async (req, res) => {
  const { slug } = input(QuoteBookingParams, req.params);
  const { items } = input(QuoteBookingBody.strict(), req.body);
  const quote = await db.transaction((tx) => quoteSelection(tx, slug, items), { isolationLevel: "repeatable read", accessMode: "read only" });
  res.set("Cache-Control", "no-store").json(quote);
});
