import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SESSION_MS,
  sessionValid,
  hashToken,
  randomToken,
  cookieName,
  readToken,
  passwordRecord,
  verifyPassword,
  sameOrigin,
} from "../src/features/room/server/security.ts";
test("セッションの期限は発行から24時間固定で、境界時刻に無効となる", () => {
  assert.equal(SESSION_MS, 86400000);
  const expires = 1000 + SESSION_MS;
  assert.equal(sessionValid(expires, expires - 1), true);
  assert.equal(sessionValid(expires, expires), false);
  assert.equal(sessionValid(expires, expires + 1), false);
});
test("トークンはランダムでハッシュ化し、Cookieはルームごとに分離する", async () => {
  const token = randomToken(),
    other = randomToken();
  assert.notEqual(token, other);
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.notEqual(await hashToken(token), token);
  assert.notEqual(await hashToken(token), await hashToken(other));
  assert.equal(readToken(`${cookieName("a")}=${token}`, "a"), token);
  assert.equal(readToken(`${cookieName("a")}=${token}`, "b"), undefined);
  assert.equal(readToken(`${cookieName("a")}=forged`, "a"), undefined);
});
test("パスワードはsalt付きで導出し、正誤と大文字小文字を検証する", async () => {
  const record = await passwordRecord("Local-password");
  assert.notEqual(record.hash, "Local-password");
  assert.equal(await verifyPassword("Local-password", record), true);
  assert.equal(await verifyPassword("local-password", record), false);
  assert.notEqual((await passwordRecord("Local-password")).hash, record.hash);
});
test("WebSocketは完全に同じOriginを要求する", () => {
  assert.equal(sameOrigin("https://quiz.example", "https://quiz.example/room/a/socket"), true);
  for (const origin of [
    null,
    "null",
    "https://quiz.example.evil",
    "http://quiz.example",
    "https://quiz.example:444",
  ])
    assert.equal(sameOrigin(origin, "https://quiz.example/room/a/socket"), false);
});
