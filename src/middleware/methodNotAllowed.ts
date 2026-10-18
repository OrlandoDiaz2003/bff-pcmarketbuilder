import { Express, NextFunction, Request, Response } from 'express';

/**
 * Express no responde 405 por sí solo: si la ruta existe pero el método no
 * coincide, cae al notFoundHandler y el cliente recibe un 404 engañoso.
 * Este handler recorre el stack de la app para reunir los métodos que sí
 * aplican a la ruta pedida y, si hay alguno, responde 405 con `Allow`.
 */

interface Layer {
  name?: string;
  path?: string;
  match?: (path: string) => boolean;
  route?: { methods?: Record<string, boolean> };
  handle?: { stack?: Layer[] };
}

function routerStack(app: Express): Layer[] {
  // Express 5 expone el router como `app.router`.
  const stack = (app as unknown as { router?: { stack?: Layer[] } }).router?.stack;
  return Array.isArray(stack) ? stack : [];
}

function methodsFor(stack: Layer[], urlPath: string): string[] {
  const allowed = new Set<string>();

  for (const layer of stack) {
    if (layer.name !== 'router' || typeof layer.match !== 'function') continue;
    if (!layer.match(urlPath)) continue;

    const prefix = layer.path ?? '';
    const rest = urlPath.slice(prefix.length) || '/';

    for (const nested of layer.handle?.stack ?? []) {
      if (!nested.route || typeof nested.match !== 'function') continue;
      if (!nested.match(rest)) continue;

      for (const method of Object.keys(nested.route.methods ?? {})) {
        if (method !== '_all') allowed.add(method.toUpperCase());
      }
    }
  }

  return [...allowed];
}

export function methodNotAllowedHandler(app: Express) {
  const stack = routerStack(app);

  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method === 'OPTIONS' || req.method === 'HEAD') {
      next();
      return;
    }

    const allowed = methodsFor(stack, req.path);
    if (allowed.length === 0 || allowed.includes(req.method.toUpperCase())) {
      next();
      return;
    }

    res.set('Allow', [...allowed, 'OPTIONS'].join(', '));
    res.status(405).json({
      status: 405,
      message: `Método ${req.method} no permitido en ${req.path}. Permitidos: ${allowed.join(', ')}`,
      timestamp: new Date().toISOString(),
    });
  };
}
