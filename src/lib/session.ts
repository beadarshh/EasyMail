// Edge-safe session helpers shared by proxy.ts and server code.
import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE = "easymail_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export type SessionClaims = { sub: string; ver: number };

function key(secret: string) {
  return new TextEncoder().encode(secret);
}

export async function signSession(claims: SessionClaims, secret: string) {
  return new SignJWT({ ver: claims.ver })
    .setSubject(claims.sub)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(key(secret));
}

/** Signature + expiry only. Server code also checks the admin still exists. */
export async function verifySession(token: string | undefined, secret: string | undefined): Promise<SessionClaims | null> {
  if (!token || !secret) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.ver !== "number") return null;
    return { sub: payload.sub, ver: payload.ver };
  } catch {
    return null;
  }
}
