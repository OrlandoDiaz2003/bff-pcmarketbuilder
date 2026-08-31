import { createApp } from './app.js';
import { config } from './config.js';

const app = createApp();

app.listen(config.port, () => {
  console.log(`[bff] Marketplace BFF escuchando en http://localhost:${config.port}`);
  console.log(`[bff] ms-publication -> ${config.publicationsBaseUrl}`);
  console.log(`[bff] ms-product     -> ${config.productsBaseUrl}`);
});