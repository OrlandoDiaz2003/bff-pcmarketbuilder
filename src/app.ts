import cors from 'cors';
import express, { Express } from 'express';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFound.js';
import catalogRouter from './routes/catalog.js';
import categoriesRouter from './routes/categories.js';
import healthRouter from './routes/health.js';

export function createApp(): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use('/health', healthRouter);
  app.use('/api/listings', catalogRouter);
  app.use('/api/categories', categoriesRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}