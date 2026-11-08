import { expect, test, type Page } from "@playwright/test";
import { createAppContext, closeAppContexts } from "./origin-guard";

// 原因調査用の一時probe。証拠取得後に削除し、製品のテスト契約にはしない。
test("一時probe: SSR入力とhydration後入力の保持を比較する", async ({
  browser,
  baseURL,
}, testInfo) => {
  const context = await createAppContext(browser, baseURL);
  const page = await context.newPage();
  const origin = new URL(baseURL!).origin;
  let releaseScripts!: () => void;
  const scriptsReleased = new Promise<void>((resolve) => {
    releaseScripts = resolve;
  });
  let firstScript!: () => void;
  const scriptIntercepted = new Promise<void>((resolve) => {
    firstScript = resolve;
  });
  let gatedScripts = 0;
  const observations: Record<string, unknown> = {};
  let probeFailed = false;

  try {
    await context.route(
      (url) => url.origin === origin,
      async (route) => {
        if (route.request().resourceType() === "script") {
          ++gatedScripts;
          firstScript();
          await scriptsReleased;
        }
        await route.continue();
      },
    );
    await page.goto("/", { waitUntil: "commit" });
    const name = page.getByLabel("あなたの名前", { exact: false });
    const password = page.getByLabel("パスワード", { exact: false });
    const show = page.getByRole("button", { name: "表示", exact: true });
    const submit = page.getByRole("button", { name: "ルームをつくる", exact: false });
    await expect(name).toBeVisible();
    await scriptIntercepted;
    observations.ssrDisabled = {
      name: await name.isDisabled(),
      password: await password.isDisabled(),
      show: await show.isDisabled(),
      submit: await submit.isDisabled(),
    };
    await name.fill("一時検証司会");
    await password.fill("probe-only-password");
    observations.beforeRelease = await inputEmptiness(page);

    releaseScripts();
    await page.waitForLoadState("load");
    observations.afterScriptLoad = await inputEmptiness(page);
    await show.click();
    await expect(password).toHaveAttribute("type", "text");
    observations.afterReactInteraction = await inputEmptiness(page);

    await name.fill("読込後検証司会");
    await password.fill("probe-after-hydration");
    await page.getByRole("button", { name: "隠す", exact: true }).click();
    await expect(password).toHaveAttribute("type", "password");
    observations.filledAfterHydration = await inputEmptiness(page);
  } catch (error) {
    probeFailed = true;
    throw error;
  } finally {
    releaseScripts();
    try {
      await testInfo.attach("hydration-input-retention-probe", {
        body: JSON.stringify({ gatedScripts, ...observations }),
        contentType: "application/json",
      });
    } catch (error) {
      if (!probeFailed) throw error;
    } finally {
      await closeAppContexts([context]);
    }
  }
});

async function inputEmptiness(page: Page) {
  return page.evaluate(() => {
    const name = document.querySelector<HTMLInputElement>('input[name="name"]');
    const password = document.querySelector<HTMLInputElement>('input[name="password"]');
    return {
      nameEmpty: name ? name.value === "" : null,
      passwordEmpty: password ? password.value === "" : null,
    };
  });
}
