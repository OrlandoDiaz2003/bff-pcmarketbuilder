export class HttpError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class BadRequestError extends HttpError {
  constructor(message: string) {
    super(message, 400);
  }
}

export class NotFoundError extends HttpError {
  constructor(message: string) {
    super(message, 404);
  }
}

export class UpstreamError extends HttpError {
  constructor(
    message: string,
    readonly upstreamStatus: number,
    readonly upstreamBody?: unknown,
  ) {
    super(message, 502);
  }
}