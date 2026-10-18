import type { CookieOptions, Request } from 'express';

export const SESSION_COOKIE = 'nwrmp_session';
export const SESSION_HOURS = 12;

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

/**
 * The web app and API share one origin (Vite proxy locally, a Vercel rewrite online),
 * so the session can be an HttpOnly, SameSite=Lax first-party cookie.
 */
export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: Boolean(process.env.VERCEL) || process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_HOURS * 3600 * 1000,
  };
}
