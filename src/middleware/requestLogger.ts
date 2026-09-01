import { NextFunction, Request, Response } from 'express';
import { log } from '../lib/logger.js';

const BODYLESS_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const summarizeBody = (body: unknown): string => {
  if (body === undefined || body === null) {
    return '';
  }
  try {
    const text = JSON.stringify(body);
    return text && text.length > 0 ? text.slice(0, 500) : '';
  } catch {
    return '[unserializable]';
  }
};

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startedAt = Date.now();
  const method = req.method;
  const url = req.originalUrl || req.url;
  const bodySummary = BODYLESS_METHODS.has(method) ? '' : summarizeBody(req.body);

  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    log(
      `[bff] ${method} ${url} -> ${res.statusCode} ${durationMs}ms` +
        (bodySummary ? ` | req body: ${bodySummary}` : ''),
    );
  });

  res.on('close', () => {
    if (!res.writableFinished) {
      const durationMs = Date.now() - startedAt;
      log(`[bff] ${method} ${url} -> ABORTADO ${durationMs}ms`);
    }
  });

  next();
}