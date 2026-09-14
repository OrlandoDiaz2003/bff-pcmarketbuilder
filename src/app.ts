import cors from 'cors';
import express, { Express } from 'express';
import path from 'node:path';
import { config } from './config.js';
import { HttpError } from './errors.js';
import { authMiddleware } from './middleware/authMiddleware.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFound.js';
import { requestLogger } from './middleware/requestLogger.js';
import catalogRouter from './routes/catalog.js';
import categoriesRouter from './routes/categories.js';
import healthRouter from './routes/health.js';
import usersRouter from './routes/users.js';

export function createApp(): Express {
  const app = express();

  const corsOptions: cors.CorsOptions = {
    origin(origin, callback) {
      if (!origin || config.corsOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new HttpError(`Origen no permitido por CORS: ${origin}`, 403));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Accept',
      'X-User-Id',
      'X-User-Role',
      'X-User-Email',
      'X-User-Name',
    ],
  };
  app.use(cors(corsOptions));

  app.use(express.json());
  app.use(requestLogger);
  app.use(authMiddleware);
  app.use('/vistas-test', express.static(path.resolve('vistas-test')));

  app.use('/health', healthRouter);
  app.use('/api/listings', catalogRouter);
  app.use('/api/categories', categoriesRouter);
  app.use('/api/users', usersRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}