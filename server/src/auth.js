import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const SECRET = process.env.JWT_SECRET || "dev-umbral-secret";
const WEEK = 30 * 24 * 60 * 60 * 1000;

export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(password, salt, 32);
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password, stored) {
  const [salt, hex] = String(stored || "").split(":");
  if (!salt || !hex) return false;
  const derived = await scryptAsync(password, salt, 32);
  const previous = Buffer.from(hex, "hex");
  if (previous.length !== derived.length) return false;
  return timingSafeEqual(previous, derived);
}

export function signToken(user) {
  const body = Buffer.from(
    JSON.stringify({ id: user.id, email: user.email, exp: Date.now() + WEEK })
  ).toString("base64url");
  const signature = createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyToken(token) {
  if (!token || !token.includes(".")) return null;
  const [body, signature] = token.split(".");
  const expected = createHmac("sha256", SECRET).update(body).digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!payload?.id || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
