/**
 * Centralized API fetch with error handling.
 * Echo's review #2: reduce silent failures across all views.
 */

import { apiUrl } from "./api";
import { getAuthToken } from "../components/PinLock";

interface ApiOptions extends RequestInit {
  /** Skip auth header (e.g. for pin-verify) */
  noAuth?: boolean;
}

/** Fetch from MAW API with auth token and consistent error handling */
export async function apiFetch<T = any>(path: string, options: ApiOptions = {}): Promise<T> {
  const { noAuth, ...fetchOpts } = options;

  const headers: Record<string, string> = {
    ...(fetchOpts.headers as Record<string, string> || {}),
  };

  // Add auth token if available
  if (!noAuth) {
    const token = getAuthToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  // Add content-type for POST/PUT
  if (fetchOpts.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(apiUrl(path), { ...fetchOpts, headers });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(res.status, body || res.statusText, path);
  }

  return res.json();
}

/** Typed API error */
export class ApiError extends Error {
  constructor(
    public status: number,
    public body: string,
    public path: string,
  ) {
    super(`API ${status}: ${body} (${path})`);
    this.name = "ApiError";
  }
}
