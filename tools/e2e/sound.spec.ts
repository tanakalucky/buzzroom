import { expect, test, type Page } from "@playwright/test";
import { createAppContext, closeAppContexts } from "./origin-guard";

const buzz = "quiz-button02-1.mp3";
const correct = "quiz-pingpong02-1.mp3";
const wrong = "quiz-buzzer02-1.mp3";

test("BR-SOUND-FILES/1: 3画面で実素材を事前decodeし、受理ごとの再生・無音・復帰を維持する", async ({
  browser,
  baseURL,
}) => {
  const contexts = await Promise.all([0, 1, 2].map(() => createAppContext(browser, baseURL)));
  const [host, one, two] = await Promise.all(contexts.map((context) => context.newPage()));
  for (const page of [host, one, two]) await observeAudio(page);

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
      expect((await audioState(page)).requests).toEqual([]);
      expect(await notes(page)).toEqual([]);
      await checkCredits(page);
      await page.getByRole("button", { name: "音をオン", exact: true }).click();
      await expect(page.getByRole("button", { name: "音をオフ", exact: true })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect.poll(() => notes(page)).toEqual([buzz]);
      const audio = await audioState(page);
      expect(audio.requests.map((url) => new URL(url).origin)).toEqual(
        Array(3).fill(new URL(baseURL!).origin),
      );
      expect(audio.decoded.map((item) => item.file).sort()).toEqual([buzz, correct, wrong].sort());
      expect(audio.decoded.every((item) => item.duration > 0 && item.frames > 0)).toBe(true);
    }

    await one.getByRole("button", { name: /早押し！/ }).click();
    await expect(one.getByRole("button", { name: /あなたに回答権があります/ })).toBeDisabled();
    await two.getByRole("button", { name: /早押し！/ }).click();
    await expect(two.getByRole("button", { name: /回答待ち/ })).toBeDisabled();
    await one.keyboard.press("Space");
    for (const page of [host, one, two])
      await expect.poll(() => notes(page)).toEqual([buzz, buzz, buzz]);

    await host.getByRole("button", { name: "× 不正解", exact: true }).click();
    await expect(one.getByRole("button", { name: /このターンはお休み/ })).toBeDisabled();
    for (const page of [host, one, two])
      await expect.poll(() => notes(page)).toEqual([buzz, buzz, buzz, wrong]);
    await host.getByRole("button", { name: "○ 正解", exact: true }).click();
    for (const page of [host, one, two]) {
      await expect.poll(() => notes(page)).toEqual([buzz, buzz, buzz, wrong, correct]);
      expect((await audioState(page)).requests).toHaveLength(3);
    }

    await one.getByRole("button", { name: "音をオフ", exact: true }).click();
    await one.getByRole("button", { name: /早押し！/ }).click();
    await expect.poll(() => notes(host)).toEqual([buzz, buzz, buzz, wrong, correct, buzz]);
    expect(await notes(one)).toEqual([buzz, buzz, buzz, wrong, correct]);
    await one.getByRole("button", { name: "音をオン", exact: true }).click();
    await expect.poll(() => notes(one)).toEqual([buzz, buzz, buzz, wrong, correct, buzz]);

    // 送信せず切断し、音オンのまま復元snapshotを受けても過去音が増えないことを確認する。
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
    expect(await notes(host)).toEqual([buzz, buzz, buzz, wrong, correct, buzz]);
    await one.reload();
    await expect(one.getByRole("button", { name: "音をオン", exact: true })).toBeVisible();
    expect(await notes(one)).toEqual([]);
    expect((await audioState(one)).requests).toEqual([]);

    await two.getByRole("button", { name: "音をオフ", exact: true }).click();
    const previous = await notes(two);
    await two.evaluate(() => {
      (window as unknown as { audioObservation: AudioObservation }).audioObservation.failStart =
        true;
    });
    await two.getByRole("button", { name: "音をオン", exact: true }).click();
    await expect(
      two.getByRole("status").filter({ hasText: "音を再生できませんでした" }),
    ).toBeVisible();
    await host.getByRole("button", { name: "↻ リセット", exact: true }).click();
    for (const page of [host, one, two]) await expect(page.getByText(/ROUND 03/)).toBeVisible();
    expect(await notes(host)).toEqual([buzz, buzz, buzz, wrong, correct, buzz]);
    await two.getByRole("button", { name: /早押し！/ }).click();
    await expect(host.getByText("音検証参加二さんに回答権があります")).toBeVisible();
    expect(await notes(two)).toEqual(previous);
    await two.evaluate(() => {
      (window as unknown as { audioObservation: AudioObservation }).audioObservation.failStart =
        false;
    });
    await two.getByRole("button", { name: "音をオン", exact: true }).click();
    await expect.poll(() => notes(two)).toEqual([...previous, buzz]);
  } finally {
    await closeAppContexts(contexts);
  }
});

for (const failure of ["http", "decode"] as const) {
  test(`BR-SOUND-FILES/1: ${failure}失敗後もリセットでき、音オンで実素材の再読込に成功する`, async ({
    browser,
    baseURL,
  }) => {
    const context = await createAppContext(browser, baseURL);
    const page = await context.newPage();
    await observeAudio(page);
    try {
      await page.goto("/");
      await enter(page, "音失敗検証", "ルームをつくる");
      await expect(page.getByRole("heading", { name: "出題者の操作" })).toBeVisible();
      const asset = new URL(`/sounds/otologic/${buzz}`, baseURL).href;
      await page.route(asset, (route) =>
        route.fulfill({
          status: failure === "http" ? 503 : 200,
          contentType: "audio/mpeg",
          body: "invalid audio",
        }),
      );
      await page.getByRole("button", { name: "音をオン", exact: true }).click();
      await expect(
        page.getByRole("status").filter({ hasText: "音を再生できませんでした" }),
      ).toBeVisible();
      expect(await notes(page)).toEqual([]);
      await page.getByRole("button", { name: "↻ リセット", exact: true }).click();
      await expect(page.getByText(/ROUND 02/)).toBeVisible();
      await page.unroute(asset);
      await page.getByRole("button", { name: "音をオン", exact: true }).click();
      await expect.poll(() => notes(page)).toEqual([buzz]);
    } finally {
      await closeAppContexts([context]);
    }
  });
}

test("BR-SOUND-FILES/1: 読込中の取消で試聴を止め、次のオンだけを有効にする", async ({
  browser,
  baseURL,
}) => {
  const context = await createAppContext(browser, baseURL);
  const page = await context.newPage();
  await observeAudio(page);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    await page.goto("/");
    await enter(page, "音取消検証", "ルームをつくる");
    await expect(page.getByRole("heading", { name: "出題者の操作" })).toBeVisible();
    const asset = new URL(`/sounds/otologic/${buzz}`, baseURL).href;
    await page.route(asset, async (route) => {
      await held;
      await route.continue();
    });
    await page.getByRole("button", { name: "音をオン", exact: true }).click();
    await expect.poll(async () => (await audioState(page)).requests.length).toBe(3);
    await page.getByRole("button", { name: "音の準備を中止", exact: true }).click();
    release();
    await page.unroute(asset);
    await expect(page.getByRole("button", { name: "音をオン", exact: true })).toBeVisible();
    expect(await notes(page)).toEqual([]);
    await page.getByRole("button", { name: "音をオン", exact: true }).click();
    await expect.poll(() => notes(page)).toEqual([buzz]);
  } finally {
    release();
    await closeAppContexts([context]);
  }
});

async function checkCredits(page: Page) {
  const footer = page.locator(".sound-credit-footer");
  await expect(footer.getByRole("link", { name: "OtoLogic", exact: true })).toHaveAttribute(
    "href",
    "https://otologic.jp/",
  );
  await expect(footer.getByRole("link", { name: "CC BY 4.0", exact: true })).toHaveAttribute(
    "href",
    "https://creativecommons.org/licenses/by/4.0/deed.ja",
  );
  const trigger = footer.getByRole("button", { name: /詳細/ });
  const dialog = page.getByRole("dialog", { name: "効果音について" });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();
    const close = dialog.getByRole("button", { name: "クレジットを閉じる" });
    await expect(close).toBeFocused();
    await expect(dialog.getByText("クイズ ボタン02-1（マルチ）", { exact: true })).toBeVisible();
    await expect(dialog.getByText("クイズ ピンポン02-1（速）", { exact: true })).toBeVisible();
    await expect(dialog.getByText("クイズ ブザー02-1（中）", { exact: true })).toBeVisible();
    await expect(dialog.getByText(/音源ファイルは未改変/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.getByRole("button", { name: "ルームに戻る" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await trigger.press("Space");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "ルームに戻る" }).click();
    await expect(trigger).toBeFocused();
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}

async function enter(page: Page, name: string, button: string) {
  await page.getByLabel("あなたの名前", { exact: false }).fill(name);
  await page.getByLabel("パスワード", { exact: false }).fill("sound-test-password");
  await page.getByRole("button", { name: button, exact: false }).click();
}

async function observeAudio(page: Page) {
  await page.addInitScript(() => {
    const observed: AudioObservation = { requests: [], decoded: [], played: [], failStart: false };
    (window as unknown as { audioObservation: AudioObservation }).audioObservation = observed;
    const bytesToFile = new WeakMap<ArrayBuffer, string>();
    const bufferToFile = new WeakMap<AudioBuffer, string>();
    const fetchOriginal = window.fetch;
    window.fetch = async (...args) => {
      const url = new URL(String(args[0]), location.href);
      const isSound = url.pathname.startsWith("/sounds/otologic/");
      if (isSound) observed.requests.push(url.href);
      const response = await fetchOriginal(...args);
      if (isSound) {
        const arrayBuffer = response.arrayBuffer.bind(response);
        response.arrayBuffer = async () => {
          const bytes = await arrayBuffer();
          bytesToFile.set(bytes, url.pathname.split("/").at(-1)!);
          return bytes;
        };
      }
      return response;
    };
    const decode = BaseAudioContext.prototype.decodeAudioData;
    BaseAudioContext.prototype.decodeAudioData = function (bytes, success, failure) {
      const file = bytesToFile.get(bytes) ?? "unknown";
      return decode.call(this, bytes, success, failure).then((buffer) => {
        bufferToFile.set(buffer, file);
        observed.decoded.push({ file, duration: buffer.duration, frames: buffer.length });
        return buffer;
      });
    };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      if (observed.failStart) throw new Error("テスト用の再生失敗");
      const result = start.apply(this, args);
      observed.played.push(this.buffer ? (bufferToFile.get(this.buffer) ?? "unknown") : "missing");
      return result;
    };
  });
}

async function audioState(page: Page) {
  return page.evaluate(
    () => (window as unknown as { audioObservation: AudioObservation }).audioObservation,
  );
}

async function notes(page: Page) {
  return (await audioState(page)).played;
}

type AudioObservation = {
  requests: string[];
  decoded: { file: string; duration: number; frames: number }[];
  played: string[];
  failStart: boolean;
};
