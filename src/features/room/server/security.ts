import { timingSafeEqual } from "node:crypto";

export const SESSION_MS = 24 * 60 * 60 * 1000;
export const isRoomId = (id: string) =>
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id);
export const cookieName = (roomId: string) => `br_${roomId.replaceAll("-", "")}`;
export const cookiePath = (roomId: string) => `/room/${roomId}`;
export function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}
export async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, "0")).join("");
}
export function sessionValid(expiresAt: number, now = Date.now()) {
  return Number.isSafeInteger(expiresAt) && now < expiresAt;
}
export function passwordValid(password: unknown): password is string {
  return typeof password === "string" && password.length >= 1 && Array.from(password).length <= 128;
}
type PasswordRecord = { salt: string; hash: string };
async function derive(password: string, salt: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: 100_000 },
    key,
    256,
  );
  return Buffer.from(bits);
}
export async function passwordRecord(password: string): Promise<PasswordRecord> {
  const salt = randomToken();
  return { salt, hash: (await derive(password, salt)).toString("hex") };
}
export async function verifyPassword(password: string, record: PasswordRecord) {
  return timingSafeEqual(await derive(password, record.salt), Buffer.from(record.hash, "hex"));
}
export function readToken(cookie: string | null, roomId: string): string | undefined {
  const value = cookie
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(cookieName(roomId) + "="))
    ?.split("=")[1];
  return value && /^[a-f0-9]{64}$/.test(value) ? value : undefined;
}
export function sameOrigin(origin: string | null, url: string) {
  return origin !== null && origin === new URL(url).origin;
}
