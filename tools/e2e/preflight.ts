import type { APIRequestContext } from "@playwright/test";

export async function verifyHostedPreview(client: APIRequestContext) {
  const response = await client.get("/api/hello", { maxRedirects: 0, timeout: 30000 });
  if (
    response.status() !== 200 ||
    !response.headers()["content-type"]?.includes("application/json")
  ) {
    throw new Error("Preview に到達できません。Access・認証・配備状態を確認してください");
  }
  if ((await response.json()).message !== "Hello from vinext on Cloudflare Workers") {
    throw new Error("Preview の応答が対象アプリと一致しません");
  }
}
