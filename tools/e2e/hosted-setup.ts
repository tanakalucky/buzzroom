import { request, type FullConfig } from "@playwright/test";
import { verifyHostedPreview } from "./preflight";

export default async function setup(config: FullConfig) {
  const client = await request.newContext({ baseURL: config.projects[0].use.baseURL });
  try {
    await verifyHostedPreview(client);
  } finally {
    await client.dispose();
  }
}
