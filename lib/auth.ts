import { createHash } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { jwtSecret, pinSecret } from "@/lib/env";
import type { Role, SessionPayload } from "@/types/domain";

const encoder = new TextEncoder();

export function hashPin(pin: string, secret = pinSecret()) {
  return createHash("sha256").update(String(pin) + secret).digest("hex");
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
