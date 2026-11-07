import { expect, test, type Page } from "@playwright/test";

test("BR-UI v1: 独立した3画面で入室・早押し・採点・司会交代と復帰を維持する", async ({
  browser,
}) => {
  const contexts = await Promise.all(
    [0, 1, 2].map(() => browser.newContext({ baseURL: "http://127.0.0.1:4173" })),
  );
  const [host, one, two] = await Promise.all(contexts.map((context) => context.newPage()));
  const errors: string[] = [];
  for (const page of [host, one, two]) page.on("pageerror", (error) => errors.push(error.message));

  try {
    await host.goto("/");
    await enter(host, "検証司会", "ui-test-password", "ルームをつくる");
    await expect(host.getByRole("heading", { name: "出題者の操作" })).toBeVisible();
    const roomUrl = host.url();
    expect(new URL(roomUrl).pathname).toMatch(/^\/room\/[a-f0-9-]{36}$/);
    expect(new URL(roomUrl).search).toBe("");

    await one.goto(roomUrl);
    await expect(one.getByRole("heading", { name: "名前とパスワードで入室" })).toBeVisible();
    await expect(one.getByRole("button", { name: /早押し！/ })).toHaveCount(0);
    await enter(one, "検証参加一", "wrong-password", "入室する");
    await expect(one.getByRole("alert")).toContainText("パスワードが違います。");
    await enter(one, "検証参加一", "ui-test-password", "入室する");
    await two.goto(roomUrl);
    await enter(two, "検証参加二", "ui-test-password", "入室する");
    for (const page of [host, one, two]) await expect(page.getByRole("article")).toHaveCount(3);

    await one.getByRole("button", { name: /早押し！/ }).click();
    await expect(host.getByText("検証参加一さんに回答権があります")).toBeVisible();
    await two.getByRole("button", { name: /早押し！/ }).click();
    await expect(card(host, "検証参加二").getByLabel("押下順 2番")).toBeVisible();
    await host.getByRole("button", { name: "× 不正解", exact: true }).click();
    await expect(card(one, "検証参加一")).toContainText("誤答ロック");
    await expect(card(host, "検証参加一").getByLabel("押下順 1番")).toBeVisible();
    await one.reload();
    await expect(one.getByRole("button", { name: /このターンはお休み/ })).toBeDisabled();
    await expect(card(one, "検証参加一")).toContainText("あなた");
    await expect(host.getByText("検証参加二さんに回答権があります")).toBeVisible();
    await host.getByRole("button", { name: "○ 正解", exact: true }).click();
    await expect(host.getByText(/ROUND 02/)).toBeVisible();
    await expect(card(host, "検証参加二").locator(".card-scores")).toContainText("正解 1");
    await expect(one.getByRole("button", { name: /早押し！/ })).toBeEnabled();

    await two.getByRole("button", { name: /早押し！/ }).click();
    await expect(host.getByText("検証参加二さんに回答権があります")).toBeVisible();
    await one.getByRole("button", { name: /早押し！/ }).click();
    await expect(card(host, "検証参加一").getByLabel("押下順 2番")).toBeVisible();
    await host.getByRole("button", { name: "× 不正解", exact: true }).click();
    for (const page of [host, one, two]) {
      await expect(card(page, "検証参加二").getByLabel("押下順 1番")).toBeVisible();
      await expect(card(page, "検証参加二")).toContainText("誤答ロック");
      await expect(card(page, "検証参加一").getByLabel("押下順 2番")).toBeVisible();
      await expect(page.getByText("検証参加一さんに回答権があります")).toBeVisible();
    }
    await expect(two.getByRole("button", { name: /このターンはお休み/ })).toBeDisabled();
    await expect(one.getByRole("button", { name: /あなたに回答権があります/ })).toBeDisabled();

    await host.getByRole("button", { name: "↻ リセット", exact: true }).click();
    for (const page of [host, one, two]) {
      await expect(page.getByText(/ROUND 03/)).toBeVisible();
      await expect(page.getByLabel(/^押下順 /)).toHaveCount(0);
      await expect(page.getByText("× 誤答ロック", { exact: true })).toHaveCount(0);
      await expect(page.getByText("わかったら、早押し！", { exact: true })).toBeVisible();
    }
    for (const page of [one, two]) {
      await expect(page.getByRole("button", { name: /早押し！/ })).toBeEnabled();
    }

    for (const page of [host, one, two]) {
      await expect(card(page, "検証参加一").locator(".card-scores > span")).toHaveText([
        "○ 正解 0",
        "× 不正解 1",
      ]);
    }
    await host.getByRole("button", { name: "検証参加一の名前を全文表示" }).click();
    const dialog = host.getByRole("dialog");
    await dialog.getByLabel("正解数", { exact: true }).fill("4");
    await dialog.getByLabel("不正解数", { exact: true }).fill("2");
    await dialog.getByRole("button", { name: "スコアを保存" }).click();
    for (const page of [host, one, two]) {
      await expect(card(page, "検証参加一").locator(".card-scores > span")).toHaveText([
        "○ 正解 4",
        "× 不正解 2",
      ]);
    }
    await dialog.getByRole("button", { name: "閉じる" }).click();
    await host.getByLabel("出題者を交代").selectOption({ label: "検証参加二" });
    await host.getByRole("button", { name: "交代する" }).click();
    await expect(two.getByRole("heading", { name: "出題者の操作" })).toBeVisible();
    await expect(two.getByRole("button", { name: /早押し！/ })).toHaveCount(0);
    await expect(host.getByRole("button", { name: /早押し！/ })).toBeEnabled();
    await two.goto("about:blank");
    await expect(host.getByText("出題者は切断中です。本人の復帰を待っています。")).toBeVisible();
    await expect(host.getByRole("heading", { name: "出題者の操作" })).toHaveCount(0);
    await two.goto(roomUrl);
    await expect(two.getByRole("heading", { name: "出題者の操作" })).toBeVisible();

    for (const width of [320, 390]) {
      await one.setViewportSize({ width, height: 844 });
      await expect(one.getByRole("button", { name: /早押し！/ })).toBeVisible();
      expect(await one.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

async function enter(page: Page, name: string, password: string, button: string) {
  await page.getByLabel("あなたの名前", { exact: false }).fill(name);
  await page.getByLabel("パスワード", { exact: false }).fill(password);
  await page.getByRole("button", { name: button, exact: false }).click();
}

function card(page: Page, name: string) {
  return page.getByRole("article", { name: `${name}のカード`, exact: true });
}
