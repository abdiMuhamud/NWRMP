// The API is served from the same origin as the web app (Vite proxy locally, a Vercel rewrite
// online), so the HttpOnly session cookie is sent automatically.
const BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Per-field messages from validation errors, keyed by field (details use "details.<key>") */
    readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message);
  }
}

export type QueryParams = Record<string, string | number | null | undefined>;

function buildUrl(path: string, params: QueryParams = {}) {
  const url = new URL(BASE + path, window.location.origin);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  return url;
}

async function request<T>(
  method: string,
  path: string,
  options: { params?: QueryParams; body?: unknown; form?: FormData; signal?: AbortSignal } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (method !== 'GET') {
    // Required by the API for every state-changing request (CSRF defence).
    headers['X-Requested-With'] = 'nwrmp';
    // For uploads the browser sets the multipart Content-Type (with its boundary) itself.
    if (!options.form) headers['Content-Type'] = 'application/json';
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, options.params), {
      method,
      headers,
      body: options.form ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
      credentials: 'same-origin',
      signal: options.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'Cannot reach the NWRMP server. Check your connection and try again.');
  }

  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    let message = res.statusText || 'Request failed';
    let fieldErrors: Record<string, string> = {};
    try {
      const body = (await res.json()) as { message?: string | string[]; fieldErrors?: Record<string, string> };
      if (body.message) message = Array.isArray(body.message) ? body.message.join('; ') : body.message;
      if (body.fieldErrors) fieldErrors = body.fieldErrors;
    } catch {
      // keep the status text
    }
    throw new ApiError(res.status, message, fieldErrors);
  }
  return (await res.json()) as T;
}

export function apiGet<T>(path: string, params: QueryParams = {}, signal?: AbortSignal): Promise<T> {
  return request<T>('GET', path, { params, signal });
}

export function apiPost<T>(path: string, body: unknown = {}): Promise<T> {
  return request<T>('POST', path, { body });
}

export function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return request<T>('PATCH', path, { body });
}

export function apiDelete<T = void>(path: string): Promise<T> {
  return request<T>('DELETE', path);
}

/** Multipart upload (photos). */
export function apiUpload<T>(path: string, form: FormData): Promise<T> {
  return request<T>('POST', path, { form });
}
