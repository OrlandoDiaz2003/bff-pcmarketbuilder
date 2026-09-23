import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { config } from '../config.js';

const client = jwksClient({
  jwksUri: `https://login.microsoftonline.com/${config.azureTenantId}/discovery/v2.0/keys`,
});

function getKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
  client.getSigningKey(header.kid, (err, key) => {
    const signingKey = key?.getPublicKey();
    callback(err, signingKey);
  });
}

export interface DecodedAccessToken {
  oid: string;
  roles?: string[];
  preferred_username?: string;
  name?: string;
  aud: string;
  iss: string;
  exp: number;
}

export function verifyAccessToken(token: string): Promise<DecodedAccessToken> {
  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      getKey,
      {
        audience: [config.azureClientId, `api://${config.azureClientId}`],
        issuer: `https://login.microsoftonline.com/${config.azureTenantId}/v2.0`,
        algorithms: ['RS256'],
      },
      (err, decoded) => {
        if (err) reject(err);
        else resolve(decoded as DecodedAccessToken);
      },
    );
  });
}