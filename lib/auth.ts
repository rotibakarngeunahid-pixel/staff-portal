import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { jwtSecret, pinSecret } from "@/lib/env";
import type { Role, SessionPayload } from "@/types/domain";

const encoder = new TextEncoder();

export function hashPin(pin: string, secret = pinSecret()) {
  return createHash("sha256").update(String(pin) + secret).digest("hex");
}

const SCRYPT_PARAMS = {
  N: 16384,
  r: 8,
  p: 1,
  keyLen: 32
};

export function hashPinSecure(pin: string) {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(String(pin) + pinSecret(), salt, SCRYPT_PARAMS.keyLen, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p
  }).toString("base64url");
  return `scrypt$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$${salt}$${hash}`;
}

function verifyScryptPin(pin: string, storedHash: string) {
  const parts = storedHash.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nRaw, rRaw, pRaw, salt, expectedRaw] = parts;
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p) || !salt || !expectedRaw) {
    return false;
  }
  const expected = Buffer.from(expectedRaw, "base64url");
  const actual = scryptSync(String(pin) + pinSecret(), salt, expected.length, { N, r, p });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function verifyPin(pin: string, storedHash?: string | null) {
  const value = String(storedHash || "");
  if (!value) return false;
  if (value.startsWith("scrypt$")) return verifyScryptPin(pin, value);
  return value === hashPin(pin);
}

export function needsPinRehash(storedHash?: string | null) {
  return !String(storedHash || "").startsWith("scrypt$");
}

export async function createSessionToken(payload: SessionPayload, hours = 8) {
  return new SignJWT({ role: payload.role, name: payload.name, outlet_id: payload.outlet_id })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${hours}h`)
    .sign(encoder.encode(jwtSecret()));
}

export async function verifySessionToken(token: string): Promise<SessionPayload> {
  const verified = await jwtVerify(token, encoder.encode(jwtSecret()));
  const role = verified.payload.role;
  if (role !== "staff" && role !== "admin") {
    throw new Error("Invalid role");
  }
  if (!verified.payload.sub) {
    throw new Error("Invalid subject");
  }
  return {
    sub: verified.payload.sub,
    role: role as Role,
    name: typeof verified.payload.name === "string" ? verified.payload.name : undefined,
    outlet_id:
      typeof verified.payload.outlet_id === "string" || verified.payload.outlet_id === null
        ? verified.payload.outlet_id
        : undefined
  };
}

export function publicStaff<T extends { pin_hash?: string; ktp_no?: string | null }>(staff: T) {
  const copy = { ...staff };
  delete copy.pin_hash;
  if (copy.ktp_no) {
    const raw = String(copy.ktp_no);
    copy.ktp_no = raw.length <= 4 ? "****" : `${"*".repeat(Math.max(0, raw.length - 4))}${raw.slice(-4)}`;
  }
  return copy;
}
