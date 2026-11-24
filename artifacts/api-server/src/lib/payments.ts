// A future provider adapter owns SetupIntent/mandate and off-session workflows.
// Real card-entry and charging are handled separately from development simulation.
export interface PaymentProvider {
  readonly name: string;
  createSetupAuthorization(input: { userId: string; returnUrl: string }): Promise<{ redirectUrl: string; reference: string }>;
  chargeAfterService(input: { bookingId: string; amountCents: number; currency: "EUR"; idempotencyKey: string }): Promise<{ reference: string }>;
}
export const simulatedPaymentProvider = "beautyhub-simulated";
export const paymentCapabilities = { configured: false, cardsAccepted: false, offSessionChargesEnabled: false } as const;

export interface AppointmentPaymentProvider {
  reference(input: { bookingId: string; idempotencyKey: string; amountCents: number; currency: "EUR" }): string;
}

export const simulatedAppointmentPayments: AppointmentPaymentProvider = {
  reference: ({ bookingId, idempotencyKey }) => "simulated:" + bookingId + ":" + idempotencyKey,
};
