import { createServer } from 'node:https';
import { createApp } from './app.js';
import { config } from './config.js';
import { log } from './lib/logger.js';
import { generateSelfSignedCert } from './lib/tls.js';

const app = createApp();

app.listen(config.port, () => {
  log(`[bff] Marketplace BFF escuchando en http://localhost:${config.port}`);
  log(`[bff] ms-publication -> ${config.publicationsBaseUrl}`);
  log(`[bff] ms-product     -> ${config.productsBaseUrl}`);
  if (config.logFile) log(`[bff] escribiendo logs en ${config.logFile}`);
});

// HTTPS con certificado autofirmado: el frontend en S3 se sirve por HTTPS y los
// navegadores bloquean llamadas HTTP desde ahí (mixed content). No hay dominio
// propio ni CloudFront disponible en esta cuenta, así que este es el puente.
// La primera visita a esta URL en cada navegador va a pedir "confiar" en el cert.
generateSelfSignedCert(config.tlsHosts)
  .then(({ key, cert }) => {
    createServer({ key, cert }, app).listen(config.httpsPort, () => {
      log(`[bff] HTTPS (autofirmado) escuchando en https://localhost:${config.httpsPort}`);
    });
  })
  .catch((err) => log(`[bff] no se pudo iniciar HTTPS: ${err}`));