import { config } from '../config.js';
import { Seller, UserResponse } from '../types.js';
import { requestJson } from './http.js';

export function getPublicProfileByOid(azureOid: string): Promise<Seller> {
  return requestJson<Seller>(`${config.usersBaseUrl}/by-id/${azureOid}`);
}

export interface UserAuthHeaders {
  userId?: string;
  role?: string;
  email?: string;
  name?: string;
}

function userHeaders(auth: UserAuthHeaders): Record<string, string> {
  const headers: Record<string, string> = {};
  if (auth.userId) headers['X-User-Id'] = auth.userId;
  if (auth.role) headers['X-User-Role'] = auth.role;
  if (auth.email) headers['X-User-Email'] = auth.email;
  if (auth.name) headers['X-User-Name'] = auth.name;
  return headers;
}

export function syncUser(auth: UserAuthHeaders): Promise<UserResponse> {
  return requestJson<UserResponse>(`${config.usersBaseUrl}/sync`, {
    method: 'POST',
    headers: userHeaders(auth),
  });
}

export function getMe(auth: { userId?: string; role?: string }): Promise<UserResponse> {
  return requestJson<UserResponse>(`${config.usersBaseUrl}/me`, {
    headers: userHeaders(auth),
  });
}

export interface UpdateUserRequest {
  fullName?: string;
  bio?: string | null;
  avatarUrl?: string | null;
  address?: string | null;
}

export function updateMe(auth: { userId?: string; role?: string }, body: UpdateUserRequest): Promise<UserResponse> {
  return requestJson<UserResponse>(`${config.usersBaseUrl}/me`, {
    method: 'PUT',
    headers: userHeaders(auth),
    body,
  });
}