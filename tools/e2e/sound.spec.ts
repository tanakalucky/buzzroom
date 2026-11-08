import { expect, test, type Page } from "@playwright/test";
import { createAppContext, closeAppContexts } from "./origin-guard";

test("BR-SOUND v2: 端末別オン・受理ごとの3音・連打禁止・復帰・再生失敗を扱う", async ({
  browser,
  baseURL,
}) => {
  const contexts = await Promise.all([0, 1, 2].map(() => createAppContext(browser, baseURL)));
  const [host, one, two] = await Promise.all(contexts.map((context) => context.newPage()));
  for (const page of [host, one, two]) {
    await page.addInitScript(() => {
      const observed = window as unknown as { soundNotes: number[]; failSound: boolean };
      observed.soundNotes = [];
      observed.failSound = false;
      const start = OscillatorNode.prototype.start;
      OscillatorNode.prototype.start = function (...args) {
        if (observed.failSound) throw new Error("テスト用の再生失敗");
        observed.soundNotes.push(this.frequency.value);
        return start.apply(this, args);
      };
    });
  }

  try {
    await host.goto("/");
    await enter(host, "音検証司会", "ルームをつくる");
    await expect(host.getByRole("heading", { name: "出題者の操作" })).toBeVisible();
    const roomUrl = host.url();
    await one.goto(roomUrl);
    await enter(one, "音検証参加一", "入室する");
    await two.goto(roomUrl);
    await enter(two, "音検証参加二", "入室する");
    for (const page of [host, one, two]) {
      await expect(page.getByRole("article")).toHaveCount(3);
      await expect(page.getByRole("button", { name: "音をオン", exact: true })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      expect(await notes(page)).toEqual([]);
    }
    for (const page of [host, one]) {
      await page.getByRole("button", { name: "音をオン", exact: true }).click();
      await expect(page.getByRole("button", { name: "音をオフ", exact: true })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect.poll(() => notes(page)).toEqual([1047]);
    }

    await one.getByRole("button", { name: /早押し！/ }).click();
    await expect(one.getByRole("button", { name: /あなたに回答権があります/ })).toBeDisabled();
    await two.getByRole("button", { name: /早押し！/ }).click();
    await expect(two.getByRole("button", { name: /回答待ち/ })).toBeDisabled();
    await one.keyboard.press("Space");
    for (const page of [host, one])
      await expect.poll(() => notes(page)).toEqual([1047, 1047, 1047]);
    expect(await notes(two)).toEqual([]);

    await host.getByRole("button", { name: "× 不正解", exact: true }).click();
    await expect(one.getByRole("button", { name: /このターンはお休み/ })).toBeDisabled();
    for (const page of [host, one])
      await expect.poll(() => notes(page)).toEqual([1047, 1047, 1047, 180]);
    await host.getByRole("button", { name: "○ 正解", exact: true }).click();
    for (const page of [host, one])
      await expect.poll(() => notes(page)).toEqual([1047, 1047, 1047, 180, 660, 880]);

    await one.getByRole("button", { name: "音をオフ", exact: true }).click();
    await one.getByRole("button", { name: /早押し！/ }).click();
    await expect.poll(() => notes(host)).toEqual([1047, 1047, 1047, 180, 660, 880, 1047]);
    expect(await notes(one)).toEqual([1047, 1047, 1047, 180, 660, 880]);
    await expect(one.getByRole("button", { name: /あなたに回答権があります/ })).toBeDisabled();
    await one.getByRole("button", { name: "音をオン", exact: true }).click();
    await expect.poll(() => notes(one)).toEqual([1047, 1047, 1047, 180, 660, 880, 1047]);

    // 同じページのWebSocketだけを一度閉じ、音オンを保った自動再接続を観測する。
    await host.evaluate(() => {
      const original = WebSocket.prototype.send;
      WebSocket.prototype.send = function () {
        WebSocket.prototype.send = original;
        this.close();
      };
    });
    await host.getByRole("button", { name: "↻ リセット", exact: true }).click();
    await expect(host.getByText("再接続しています", { exact: true })).toBeVisible();
    await expect(host.getByText("● 接続中", { exact: false })).toBeVisible();
    expect(await notes(host)).toEqual([1047, 1047, 1047, 180, 660, 880, 1047]);
    await one.reload();
    await expect(one.getByRole("button", { name: "音をオン", exact: true })).toBeVisible();
    expect(await notes(one)).toEqual([]);

    await two.evaluate(() => {
      (window as unknown as { failSound: boolean }).failSound = true;
    });
    await two.getByRole("button", { name: "音をオン", exact: true }).click();
    await expect(
      two.getByRole("status").filter({ hasText: "音を再生できませんでした" }),
    ).toBeVisible();
    await host.getByRole("button", { name: "↻ リセット", exact: true }).click();
    for (const page of [host, one, two]) {
      await expect(page.getByText(/ROUND 03/)).toBeVisible();
    }
    await expect(two.getByRole("button", { name: /早押し！/ })).toBeEnabled();
    await two.getByRole("button", { name: /早押し！/ }).click();
    await expect(host.getByText("音検証参加二さんに回答権があります")).toBeVisible();
    expect(await notes(two)).toEqual([]);
  } finally {
    await closeAppContexts(contexts);
  }
});

async function enter(page: Page, name: string, button: string) {
  await page.getByLabel("あなたの名前", { exact: false }).fill(name);
  await page.getByLabel("パスワード", { exact: false }).fill("sound-test-password");
  await page.getByRole("button", { name: button, exact: false }).click();
}

async function notes(page: Page) {
  return page.evaluate(() => (window as unknown as { soundNotes: number[] }).soundNotes);
}
