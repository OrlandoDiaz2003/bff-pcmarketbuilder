import { config } from '../config.js';
import { Seller } from '../types.js';
import { requestJson } from './http.js';

export function getPublicProfileByOid(azureOid: string): Promise<Seller> {
  return requestJson<Seller>(`${config.usersBaseUrl}/by-id/${azureOid}`);
}