import cors from 'cors';
import express, { Express, Request, Response } from 'express';
import path from 'node:path';
import { config } from './config.js';
import { HttpError } from './errors.js';
import { authMiddleware } from './middleware/authMiddleware.js';
import { errorHandler } from './middleware/errorHandler.js';
import { methodNotAllowedHandler } from './middleware/methodNotAllowed.js';
import { notFoundHandler } from './middleware/notFound.js';
import { requestLogger } from './middleware/requestLogger.js';
import catalogRouter from './routes/catalog.js';
import categoriesRouter from './routes/categories.js';
import healthRouter from './routes/health.js';
import productsRouter from './routes/products.js';
import usersRouter from './routes/users.js';

export function createApp(): Express {
  const app = express();

  const corsOptions: cors.CorsOptions = {
    origin(origin, callback) {
      // GitbHub Pages sirve el Origin en minusculas; normalizar para no depender del caso.
      const normalize = (value: string) => value.toLowerCase().replace(/\/+$/, '');
      if (
        !origin ||
        config.corsOrigins.some((allowed) => normalize(allowed) === normalize(origin))
      ) {
        callback(null, true);
      } else {
        callback(new HttpError(`Origen no permitido por CORS: ${origin}`, 403));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Accept',
      // El front envía únicamente Authorization con el Bearer token validado por el BFF.
      'Authorization',
    ],
  };
  app.use(cors(corsOptions));

  app.use(express.json());
  app.use(requestLogger);
  app.use(authMiddleware);

  // Sin index.html, express.static no resuelve el directorio raíz: redirigir a la vista principal.
  const vistasRedirect = (_req: Request, res: Response) => res.redirect(302, '/vistas-test/view.html');
  app.get('/vistas-test', vistasRedirect);
  app.get('/vistas-test/', vistasRedirect);
  app.use('/vistas-test', express.static(path.resolve('vistas-test')));

  app.use('/health', healthRouter);
  app.use('/api/listings', catalogRouter);
  app.use('/api/categories', categoriesRouter);
  app.use('/api/products', productsRouter);
  app.use('/api/users', usersRouter);

  app.use(methodNotAllowedHandler(app));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}