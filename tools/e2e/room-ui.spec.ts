import { expect, test } from "@playwright/test";

test("移動した画面でURLコピーの成功・失敗と入室後の入力中非表示を維持する", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const participantContext = await browser.newContext();
  const host = await hostContext.newPage();
  const participant = await participantContext.newPage();

  try {
    await host.goto("http://127.0.0.1:4173/");
    await host.getByLabel("あなたの名前", { exact: false }).fill("コピー検証司会");
    await host.getByLabel("パスワード", { exact: false }).fill("copy-test-password");
    await host.getByRole("button", { name: "ルームをつくる", exact: false }).click();
    await expect(host.getByRole("heading", { name: "出題者の操作" })).toBeVisible();
    const roomUrl = host.url();

    await host.evaluate(() => {
      navigator.clipboard.writeText = async () => {
        throw new Error("テスト用のコピー拒否");
      };
    });
    await host.getByRole("button", { name: "URLをコピー", exact: true }).click();
    await expect(
      host.getByRole("status").filter({ hasText: "コピーできませんでした" }),
    ).toBeVisible();
    const fallback = host.getByRole("textbox", { name: "ルームURL", exact: true });
    await expect(fallback).toHaveValue(roomUrl);
    await host.getByRole("button", { name: "URLを選択", exact: true }).click();
    await expect(fallback).toBeFocused();
    expect(await fallback.evaluate((input: HTMLInputElement) => input.selectionStart)).toBe(0);
    expect(await fallback.evaluate((input: HTMLInputElement) => input.selectionEnd)).toBe(
      roomUrl.length,
    );

    await host.evaluate(() => {
      navigator.clipboard.writeText = async (value) => {
        if (value !== location.origin + location.pathname) throw new Error("URLが一致しません");
      };
    });
    await host.getByRole("button", { name: "URLをコピー", exact: true }).click();
    await expect(
      host.getByRole("status").filter({ hasText: "ルームURLをコピーしました" }),
    ).toBeVisible();
    await expect(fallback).toHaveCount(0);

    await participant.goto(roomUrl);
    await participant.getByLabel("あなたの名前", { exact: false }).fill("コピー検証参加者");
    await participant.getByLabel("パスワード", { exact: false }).fill("copy-test-password");
    await participant.getByRole("button", { name: "入室する", exact: false }).click();
    const buzzer = participant.getByRole("button", { name: /早押し！/ });
    await expect(buzzer).toBeEnabled();
    await participant.getByRole("button", { name: "コピー検証参加者の名前を全文表示" }).click();
    await expect(participant.getByRole("dialog")).toBeVisible();
    await expect(buzzer).toBeHidden();
    await participant.getByRole("button", { name: "閉じる", exact: true }).click();
    await expect(buzzer).toBeVisible();

    await participant.goto("http://127.0.0.1:4173/room/invalid");
    await expect(
      participant.getByRole("heading", { name: "ルームが見つかりません" }),
    ).toBeVisible();
    await participant.getByRole("link", { name: "作成画面へ戻る" }).click();
    await expect(participant.getByRole("heading", { name: "ルームをつくる" })).toBeVisible();
  } finally {
    await Promise.all([hostContext.close(), participantContext.close()]);
  }
});
