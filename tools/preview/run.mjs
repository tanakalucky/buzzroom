import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createApi, dispatchTarget, resolveTarget } from "./target.mjs";

try {
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
  const mode = process.argv[2];
  const input =
    mode === "dispatch"
      ? {
          source_run_id: String(event.workflow_run.id),
          source_run_attempt: String(event.workflow_run.run_attempt),
        }
      : event.inputs;
  const api = createApi();
  const target = await resolveTarget(api, input);
  if (mode === "dispatch") {
    // 読取の間にも push/close が起きるため、API 起動直前に再照合する。
    await resolveTarget(api, target);
    const result = await dispatchTarget(api, target);
    await summary(
      result.dispatched
        ? "GitHub API で Hosted E2E を起動しました"
        : `同じ deploy の E2E は起動済みです: ${result.run_url}`,
    );
  } else if (mode === "verify") {
    for (const [key, value] of Object.entries(target))
      await appendFile(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
    await mkdir("test-results", { recursive: true });
    await writeFile("test-results/preview-target.json", JSON.stringify(target, null, 2) + "\n");
    await summary(
      `PR #${target.pr_number}\nhead=${target.head_sha}\nPreview=${target.preview_url}\n対象=${target.deployment_url}\nversion=${target.deployment_id}\nsource run=${target.source_run_id}/${target.source_run_attempt}`,
    );
  } else {
    throw new Error("dispatch または verify を指定してください");
  }
} catch (error) {
  // API response body・headers・環境変数は記録しない。
  await summary(`Hosted E2E の対象照合・起動に失敗しました: ${error.message}`);
  console.error(error.message);
  process.exitCode = 1;
}

async function summary(message) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `${message}\n`);
}
