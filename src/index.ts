import { createApp } from './app.js';
import { config } from './config.js';
import { log } from './lib/logger.js';

const app = createApp();

app.listen(config.port, () => {
  log(`[bff] Marketplace BFF escuchando en http://localhost:${config.port}`);
  log(`[bff] ms-publication -> ${config.publicationsBaseUrl}`);
  log(`[bff] ms-product     -> ${config.productsBaseUrl}`);
  if (config.logFile) log(`[bff] escribiendo logs en ${config.logFile}`);
});