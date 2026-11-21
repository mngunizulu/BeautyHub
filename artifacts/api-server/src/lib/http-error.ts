export class HttpError extends Error {
  constructor(public status: number, message: string, public code = "REQUEST_REJECTED") {
    super(message);
  }
}
