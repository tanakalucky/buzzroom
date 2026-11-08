import { test } from "node:test";
import assert from "node:assert/strict";
import { allowsRequest } from "./e2e/origin-guard.ts";

const origin = new URL("https://12345678-buzzroom.luckyyeslucky777.workers.dev");
const local = new URL("http://127.0.0.1:4173");

test("HTTPS tunnel は検証した Preview の authority だけ許可する", () => {
  assert.equal(allowsRequest(`${origin.hostname}:443`, origin, true), true);
});

for (const value of [
  "buzzroom.tanakalucky.com:443",
  `${origin.hostname}.evil.test:443`,
  `${origin.hostname}:80`,
  `user@${origin.hostname}:443`,
  `${origin.hostname}:443/`,
  "127.0.0.1:4173",
  undefined,
]) {
  test(`別 authority ${value} は接続前に拒否する`, () => {
    assert.equal(allowsRequest(value, origin, true), false);
  });
}

for (const url of ["http://127.0.0.1:4173/create", "ws://127.0.0.1:4173/socket"]) {
  test(`ローカル対象内の ${url} は許可する`, () => {
    assert.equal(allowsRequest(url, local, false), true);
  });
}

for (const url of [
  "http://127.0.0.1:4174/create",
  "https://127.0.0.1:4173/create",
  "http://example.test/create",
  "http://user:pass@127.0.0.1:4173/",
  "/create",
  undefined,
]) {
  test(`別 origin / 不正な ${url} は要求前に拒否する`, () => {
    assert.equal(allowsRequest(url, local, false), false);
  });
}

test("HTTPS 対象へ平文HTTP/WSを送信しない", () => {
  assert.equal(allowsRequest(origin.href, origin, false), false);
  assert.equal(allowsRequest(origin.href.replace("https:", "http:"), origin, false), false);
});
