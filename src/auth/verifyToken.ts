import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { config } from '../config.js';

/**
 * El BFF acepta tokens de dos emisores:
 *  - Cognito: compradores y vendedores (siempre se traducen a BUYER_SELLER).
 *  - Entra ID: administradores (el rol sale de la claim `roles` del token).
 * El emisor (`iss`) decide con qué claves se verifica; un token nunca puede reclamar roles de otro emisor.
 */

const entraClient = jwksClient({
  jwksUri: `https://login.microsoftonline.com/${config.azureTenantId}/discovery/v2.0/keys`,
});

export const cognitoIssuer = `https://cognito-idp.${config.cognito.region}.amazonaws.com/${config.cognito.userPoolId}`;
const cognitoClient = jwksClient({ jwksUri: `${cognitoIssuer}/.well-known/jwks.json` });

const entraIssuers: [string, ...string[]] = [
  `https://login.microsoftonline.com/${config.azureTenantId}/v2.0`,
  `https://sts.windows.net/${config.azureTenantId}/`,
];

const keyResolver =
  (client: jwksClient.JwksClient): jwt.GetPublicKeyOrSecret =>
  (header, callback) => {
    client.getSigningKey(header.kid, (err, key) => {
      callback(err, key?.getPublicKey());
    });
  };

export interface DecodedAccessToken {
  oid: string;
  roles?: string[];
  preferred_username?: string;
  upn?: string;
  email?: string;
  name?: string;
  aud: string;
  iss: string;
  exp: number;
}

interface DecodedCognitoToken {
  sub: string;
  iss: string;
  exp: number;
  token_use?: string;
  client_id?: string; // access token
  aud?: string; // id token
  email?: string;
  name?: string;
  username?: string;
  'cognito:username'?: string;
  'cognito:groups'?: string[];
}

export type IdentityProvider = 'entra' | 'cognito';

/** Identidad ya validada, independiente del emisor. `roles` son los roles de Entra (vacío para Cognito). */
export interface VerifiedIdentity {
  provider: IdentityProvider;
  userId: string;
  roles: string[];
  email: string;
  name: string;
}

function verifyJwt<T>(token: string, getKey: jwt.GetPublicKeyOrSecret, options: jwt.VerifyOptions): Promise<T> {
  return new Promise((resolve, reject) => {
    jwt.verify(token, getKey, { ...options, algorithms: ['RS256'] }, (err, decoded) => {
      if (err) reject(err);
      else resolve(decoded as T);
    });
  });
}

export function verifyAccessToken(token: string): Promise<DecodedAccessToken> {
  return verifyJwt<DecodedAccessToken>(token, keyResolver(entraClient), {
    audience: [config.azureClientId, `api://${config.azureClientId}`],
    // v2 o v1 según accessTokenAcceptedVersion en el manifest del App Registration.
    issuer: entraIssuers,
  });
}

/**
 * Acepta el access token o el ID token de Cognito. El access token no trae `aud` sino `client_id`, y tampoco
 * email/nombre: para que el alta en ms-user tenga correo, el front debe enviar el ID token.
 */
export async function verifyCognitoToken(token: string): Promise<DecodedCognitoToken> {
  const decoded = await verifyJwt<DecodedCognitoToken>(token, keyResolver(cognitoClient), { issuer: cognitoIssuer });
  const appClient = decoded.token_use === 'id' ? decoded.aud : decoded.client_id;
  if (decoded.token_use !== 'id' && decoded.token_use !== 'access') {
    throw new Error('token_use de Cognito no válido');
  }
  if (appClient !== config.cognito.clientId) {
    throw new Error('El token de Cognito no pertenece a este cliente de aplicación');
  }
  return decoded;
}

export async function verifyIdentity(token: string): Promise<VerifiedIdentity> {
  const unverified = jwt.decode(token);
  const iss = unverified && typeof unverified === 'object' ? unverified.iss : undefined;

  if (iss === cognitoIssuer) {
    const decoded = await verifyCognitoToken(token);
    return {
      provider: 'cognito',
      userId: decoded.sub,
      roles: [], // Cognito nunca otorga roles de Entra; el BFF decide el rol (ver authMiddleware)
      email: decoded.email ?? '',
      name: decoded.name ?? decoded.email ?? decoded['cognito:username'] ?? decoded.username ?? '',
    };
  }

  if (iss && entraIssuers.includes(iss)) {
    const decoded = await verifyAccessToken(token);
    return {
      provider: 'entra',
      userId: decoded.oid,
      roles: decoded.roles ?? [],
      email: decoded.preferred_username ?? '',
      name: decoded.name ?? '',
    };
  }

  throw new Error('Emisor del token no reconocido');
}
