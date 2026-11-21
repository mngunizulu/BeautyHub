// A future provider adapter owns SetupIntent/mandate and off-session workflows.
// This stage has no card-entry endpoint or active payment provider.
export interface PaymentProvider {
  readonly name: string;
  createSetupAuthorization(input: { userId: string; returnUrl: string }): Promise<{ redirectUrl: string; reference: string }>;
  chargeAfterService(input: { bookingId: string; amountCents: number; currency: "EUR"; idempotencyKey: string }): Promise<{ reference: string }>;
}
export const paymentCapabilities = { configured: false, cardsAccepted: false, offSessionChargesEnabled: false } as const;
