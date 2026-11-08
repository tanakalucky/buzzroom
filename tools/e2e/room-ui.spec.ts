import { expect, test } from "@playwright/test";
import { createAppContext, closeAppContexts } from "./origin-guard";

test("初期化前の操作を防ぎ、入力保持・URLコピー・入室後の入力中非表示を維持する", async ({
  browser,
  baseURL,
}) => {
  const hostContext = await createAppContext(browser, baseURL);
  const participantContext = await createAppContext(browser, baseURL);
  const host = await hostContext.newPage();
  const participant = await participantContext.newPage();
  let releaseScripts!: () => void;
  const scriptsReleased = new Promise<void>((resolve) => {
    releaseScripts = resolve;
  });

  try {
    const origin = new URL(baseURL!).origin;
    await hostContext.route(
      (url) => url.origin === origin,
      async (route) => {
        if (route.request().resourceType() === "script") await scriptsReleased;
        await route.continue();
      },
    );
    await host.goto("/", { waitUntil: "commit" });
    const name = host.getByLabel("あなたの名前", { exact: false });
    const password = host.getByLabel("パスワード", { exact: false });
    const show = host.getByRole("button", { name: "表示", exact: true });
    const submit = host.getByRole("button", { name: "ルームをつくる", exact: false });
    await expect(name).toBeVisible();
    for (const control of [name, password, show, submit]) await expect(control).toBeDisabled();

    releaseScripts();
    for (const control of [name, password, show, submit]) await expect(control).toBeEnabled();
    await name.fill("コピー検証司会");
    await password.fill("copy-test-password");
    for (const [label, type] of [
      ["表示", "text"],
      ["隠す", "password"],
    ] as const) {
      await host.getByRole("button", { name: label, exact: true }).click();
      await expect(password).toHaveAttribute("type", type);
      expect(
        await name.evaluate((input: HTMLInputElement) => input.value === "コピー検証司会"),
      ).toBe(true);
      expect(
        await password.evaluate((input: HTMLInputElement) => input.value === "copy-test-password"),
      ).toBe(true);
    }
    await submit.click();
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

    await participant.goto("/room/invalid");
    await expect(
      participant.getByRole("heading", { name: "ルームが見つかりません" }),
    ).toBeVisible();
    await participant.getByRole("link", { name: "作成画面へ戻る" }).click();
    await expect(participant.getByRole("heading", { name: "ルームをつくる" })).toBeVisible();
  } finally {
    releaseScripts();
    await closeAppContexts([hostContext, participantContext]);
  }
});
