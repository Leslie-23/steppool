import type { NextFunction, Request, Response } from 'express';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  // Duck-typed: shared/ contracts may load a different zod copy than the server, so instanceof is unreliable.
  if ((err as Error)?.name === 'ZodError') {
    const issues = (err as { issues?: { message: string }[] }).issues;
    res.status(400).json({ error: issues?.[0]?.message ?? 'Invalid request' });
    return;
  }
  const status = (err as { status?: number }).status;
  if (typeof status === 'number' && ((status >= 400 && status < 500) || err instanceof HttpError)) {
    res.status(status).json({ error: (err as Error).message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
}
