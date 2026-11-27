import { CrossSiteRequestRefused } from "src/types/error.types";

/** The cookie holding a web sign-in's access token (ADR 0025). */
export const ACCESS_COOKIE = "__Host-Http-cc_access";

/** The cookie holding a web sign-in's refresh token (ADR 0025). */
export const REFRESH_COOKIE = "__Host-Http-cc_refresh";

/** The header every request on a web sign-in must carry, so a cross-origin page needs a preflight. */
export const CSRF_HEADER = "x-codeclarity-csrf";

/** The request headers the checks read; Fastify and socket.io both give this shape. */
export type RequestHeaders = Record<string, string | string[] | undefined>;

/** The tokens of a sign-in and when each one ends. */
export interface SessionTokens {
  accessToken: string;
  accessExpiry: Date;
  refreshToken: string;
  refreshExpiry: Date;
}

// The cookie attributes RFC 10017 section 6.1.3.2 asks for; a __Host- name needs Path=/ and no Domain.
const ATTRIBUTES = "Path=/; HttpOnly; Secure; SameSite=Strict";

// JWTs and refresh tokens use only base64url characters and dots.
const TOKEN_VALUE = /^[A-Za-z0-9._-]+$/;

function cookie(name: string, value: string, maxAgeSeconds: number): string {
  return `${name}=${value}; Max-Age=${maxAgeSeconds}; ${ATTRIBUTES}`;
}

function secondsUntil(end: Date, now: Date): number {
  return Math.max(0, Math.floor((end.getTime() - now.getTime()) / 1000));
}

/** The Set-Cookie values that hand a sign-in's tokens to the browser. */
export function sessionCookies(
  session: SessionTokens,
  now: Date = new Date(),
): string[] {
  return [
    cookie(
      ACCESS_COOKIE,
      session.accessToken,
      secondsUntil(session.accessExpiry, now),
    ),
    cookie(
      REFRESH_COOKIE,
      session.refreshToken,
      secondsUntil(session.refreshExpiry, now),
    ),
  ];
}

/** The Set-Cookie values that delete both session cookies. */
export function clearedSessionCookies(): string[] {
  return [cookie(ACCESS_COOKIE, "", 0), cookie(REFRESH_COOKIE, "", 0)];
}

/** The part of a Fastify reply that sets response headers. */
export interface CookieReply {
  header(name: string, value: string[]): unknown;
}

/** Hands a sign-in's tokens to the browser as cookies. */
export function setSessionCookies(
  reply: CookieReply,
  session: SessionTokens,
): void {
  reply.header("set-cookie", sessionCookies(session));
}

/** Tells the browser to delete both session cookies. */
export function clearSessionCookies(reply: CookieReply): void {
  reply.header("set-cookie", clearedSessionCookies());
}

function header(headers: RequestHeaders, name: string): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value.join("; ") : value;
}

/**
 * The value of the named cookie, or undefined when it is missing, malformed
 * or sent more than once (a second copy was not set by the API).
 */
export function readCookie(
  headers: RequestHeaders,
  name: string,
): string | undefined {
  const values = (header(headers, "cookie") ?? "")
    .split(";")
    .map((pair) => pair.trim())
    .filter((pair) => pair.startsWith(`${name}=`))
    .map((pair) => pair.slice(name.length + 1));
  if (values.length !== 1) return undefined;
  const value = values[0]!;
  return TOKEN_VALUE.test(value) ? value : undefined;
}

// The host and port an Origin names, or undefined when it names none ("null").
function hostOf(origin: string): string | undefined {
  try {
    return new URL(origin).host;
  } catch {
    return undefined;
  }
}

/**
 * Refuses a request on a web sign-in that a page on another origin could
 * have sent: it must carry the custom header, and a browser's Fetch Metadata
 * or Origin must name this origin (ADR 0025).
 * @throws {CrossSiteRequestRefused}
 */
export function assertSameOrigin(headers: RequestHeaders): void {
  if (header(headers, CSRF_HEADER) !== "1") {
    throw new CrossSiteRequestRefused();
  }
  const site = header(headers, "sec-fetch-site");
  if (site !== undefined) {
    if (site !== "same-origin") throw new CrossSiteRequestRefused();
    return;
  }
  const origin = header(headers, "origin");
  if (origin !== undefined && hostOf(origin) !== header(headers, "host")) {
    throw new CrossSiteRequestRefused();
  }
}
