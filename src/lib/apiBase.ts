/**
 * API Base URL Resolver
 *
 * Single source of truth for API base URL.
 * - If VITE_API_BASE_URL is set, use it
 * - Otherwise, use same-origin (""), so Vite proxy can handle /api
 */
const rawBase = import.meta.env.VITE_API_BASE_URL || '';

export const apiBase = rawBase.replace(/\/+$/, '');

export function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return apiBase ? `${apiBase}${normalizedPath}` : normalizedPath;
}
