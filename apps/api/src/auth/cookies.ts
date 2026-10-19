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
 * The web app and API share one origin (Vite proxy locally, a Vercel rewrite or nginx online),
 * so the session can be an HttpOnly, SameSite=Lax first-party cookie.
 * Secure follows the protocol the browser used (X-Forwarded-Proto from the proxy, 'trust proxy'
 * is on): browsers drop Secure cookies on plain-HTTP sites, which would make sign-in impossible.
 */
export function sessionCookieOptions(req: Request): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: Boolean(process.env.VERCEL) || req.secure,
    path: '/',
    maxAge: SESSION_HOURS * 3600 * 1000,
  };
}
