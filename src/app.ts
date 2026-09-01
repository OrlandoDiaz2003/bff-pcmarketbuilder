import cors from 'cors';
import express, { Express } from 'express';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFound.js';
import { requestLogger } from './middleware/requestLogger.js';
import catalogRouter from './routes/catalog.js';
import categoriesRouter from './routes/categories.js';
import healthRouter from './routes/health.js';
import usersRouter from './routes/users.js';

export function createApp(): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(requestLogger);

  app.use('/health', healthRouter);
  app.use('/api/listings', catalogRouter);
  app.use('/api/categories', categoriesRouter);
  app.use('/api/users', usersRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}