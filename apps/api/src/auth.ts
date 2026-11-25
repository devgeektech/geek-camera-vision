import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "./env.js";

const COOKIE = "visionops_session";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function signSession(username: string): string {
  const body = Buffer.from(JSON.stringify({ u: username, exp: Date.now() + WEEK_MS })).toString("base64url");
  const sig = createHmac("sha256", env.sessionSecret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifySession(token: string | undefined): string | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", env.sessionSecret).update(body).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as { u?: string; exp?: number };
    if (!payload.u || !payload.exp || payload.exp < Date.now()) return null;
    return payload.u;
  } catch {
    return null;
  }
}

export function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: WEEK_MS / 1000,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(COOKIE, { path: "/" });
}

export function readSession(request: FastifyRequest): string | null {
  const cookie = (request.cookies as Record<string, string | undefined>)[COOKIE];
  const header = request.headers.authorization;
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  return verifySession(cookie ?? bearer);
}

export function passwordsMatch(input: string, expected: string): boolean {
  const salt = "visionops-login";
  const a = scryptSync(input, salt, 32);
  const b = scryptSync(expected, salt, 32);
  return timingSafeEqual(a, b);
}

const loginAttempts = new Map<string, { count: number; resetAt: number }>();

export function loginAllowed(ip: string): boolean {
  const now = Date.now();
  const current = loginAttempts.get(ip);
  if (!current || current.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  current.count += 1;
  return current.count <= 10;
}

export function newSecret(): string {
  return randomBytes(24).toString("base64url");
}
