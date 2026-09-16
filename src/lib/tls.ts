import { generate } from 'selfsigned';

export interface TlsCert {
  key: string;
  cert: string;
}

/**
 * Certificado autofirmado generado en cada arranque del proceso. No hay dominio
 * propio para el BFF (solo IP pública/privada de ECS), así que un cert real de
 * una CA no aplica aquí; el navegador va a pedir "confiar" en él la primera vez
 * que se visite la URL del BFF directamente.
 */
export async function generateSelfSignedCert(hosts: string[]): Promise<TlsCert> {
  const altNames = hosts.map((host) =>
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ? { type: 7 as const, ip: host } : { type: 2 as const, value: host },
  );

  const notBeforeDate = new Date();
  const notAfterDate = new Date(notBeforeDate);
  notAfterDate.setDate(notAfterDate.getDate() + 825);

  const pems = await generate([{ name: 'commonName', value: hosts[0] }], {
    keyType: 'ec',
    curve: 'P-256',
    algorithm: 'sha256',
    notBeforeDate,
    notAfterDate,
    extensions: [
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true },
      { name: 'subjectAltName', altNames },
    ],
  });

  return { key: pems.private, cert: pems.cert };
}
