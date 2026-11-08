const repository = "tanakalucky/buzzroom";
const workflow = "preview-e2e.yml";
const ownerId = 39301079;
const previewDomain = "luckyyeslucky777.workers.dev";

export async function resolveTarget(api, input) {
  const runId = positiveInteger(input.source_run_id);
  const attempt = positiveInteger(input.source_run_attempt);
  const run = await api.github(`/actions/runs/${runId}`);
  validateRun(run, runId, attempt);

  const jobs = await api.githubPages(`/actions/runs/${runId}/attempts/${attempt}/jobs`, "jobs");
  const deployed = jobs.some(
    (job) =>
      job.name === "deploy" &&
      job.conclusion === "success" &&
      job.steps?.some((step) => step.name === "Preview の deploy" && step.conclusion === "success"),
  );
  if (!deployed) throw new Error("Preview deploy step が成功していません");

  // workflow_run.pull_requests は空の場合があるため、GitHub の最新 PR から照合する。
  const pulls = await api.githubPages(
    `/pulls?state=open&head=${encodeURIComponent(`tanakalucky:${run.head_branch}`)}`,
    null,
  );
  const matches = pulls.filter(
    (pr) =>
      pr.state === "open" &&
      pr.head?.sha === run.head_sha &&
      pr.head?.repo?.full_name === repository &&
      pr.base?.repo?.full_name === repository,
  );
  if (matches.length !== 1) throw new Error("同じ head の open PR を一意に確認できません");
  const pr = await api.github(`/pulls/${positiveInteger(matches[0].number)}`);
  if (
    pr.state !== "open" ||
    pr.head?.sha !== run.head_sha ||
    pr.head?.repo?.full_name !== repository
  )
    throw new Error("PR の状態または head が変わりました");

  const path = `/workers/workers/buzzroom/previews/pr-${pr.number}`;
  const preview = await api.cloudflare(path);
  const deployment = await api.cloudflare(`${path}/deployments/latest`);
  const target = validateDeployment(preview, deployment, pr.number, run.head_sha);
  const result = {
    ...target,
    source_run_id: runId,
    source_run_attempt: attempt,
    pr_number: String(pr.number),
    head_sha: run.head_sha,
  };
  for (const key of ["pr_number", "head_sha", "deployment_id"]) {
    if (input[key] !== undefined && input[key] !== result[key])
      throw new Error(`起動時の ${key} と現在の対象が一致しません`);
  }
  return result;
}

export async function dispatchTarget(api, target) {
  const title = runTitle(target);
  const runs = await api.githubPages(
    `/actions/workflows/${workflow}/runs?event=workflow_dispatch`,
    "workflow_runs",
  );
  const existing = runs.find((run) => run.display_title === title);
  if (existing) return { dispatched: false, run_url: existing.html_url };

  // POST の通信失敗は成否不明。自動再送せず、run 一覧の読み戻しを担当者へ渡す。
  await api.github(`/actions/workflows/${workflow}/dispatches`, {
    method: "POST",
    body: {
      ref: "main",
      inputs: Object.fromEntries(
        ["source_run_id", "source_run_attempt", "pr_number", "head_sha", "deployment_id"].map(
          (key) => [key, target[key]],
        ),
      ),
    },
  });
  return { dispatched: true };
}

export function runTitle(target) {
  return `Preview E2E ${target.source_run_id}/${target.source_run_attempt}`;
}

export function validateDeployment(preview, deployment, pr, sha) {
  if (preview.name !== `pr-${pr}` || preview.slug !== `pr-${pr}`)
    throw new Error("対象外の Preview です");
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(deployment.id))
    throw new Error("deployment ID が不正です");
  if (deployment.annotations?.["workers/commit_sha"] !== sha)
    throw new Error("Preview の commit SHA が PR head と一致しません");

  // 公式 API の応答にある URL だけを使用し、本番・任意ホスト・redirect先は受け入れない。
  const previewUrl = requireOfficialUrl(preview.urls, `pr-${pr}-buzzroom.${previewDomain}`);
  const deploymentUrl = requireOfficialUrl(
    deployment.urls,
    `${deployment.id.slice(0, 8)}-buzzroom.${previewDomain}`,
  );
  return { preview_url: previewUrl, deployment_url: deploymentUrl, deployment_id: deployment.id };
}

export function createApi(env = process.env, fetcher = fetch) {
  if (env.GITHUB_REPOSITORY !== repository) throw new Error("対象 repository が違います");
  if (!env.GH_TOKEN) throw new Error("GitHub token がありません");
  const github = async (path, options = {}) =>
    requestJson(
      fetcher,
      `https://api.github.com/repos/${repository}${path}`,
      env.GH_TOKEN,
      options,
    );
  const githubPages = async (path, key) => {
    const items = [];
    for (let page = 1; ; page++) {
      const result = await github(
        `${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`,
      );
      const chunk = key === null ? result : result[key];
      if (!Array.isArray(chunk)) throw new Error("GitHub 一覧応答が不正です");
      items.push(...chunk);
      if (chunk.length < 100) return items;
    }
  };
  const cloudflare = async (path) => {
    if (!/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID ?? "") || !env.CLOUDFLARE_API_TOKEN)
      throw new Error("Cloudflare の既存認証設定がありません");
    const result = await requestJson(
      fetcher,
      `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}${path}`,
      env.CLOUDFLARE_API_TOKEN,
    );
    if (result.success !== true || !result.result)
      throw new Error("Cloudflare の照合に失敗しました");
    return result.result;
  };
  return { github, githubPages, cloudflare };
}

function validateRun(run, id, attempt) {
  if (
    String(run.id) !== id ||
    String(run.run_attempt) !== attempt ||
    run.path !== ".github/workflows/preview-deploy.yml" ||
    run.event !== "pull_request" ||
    run.status !== "completed" ||
    run.conclusion !== "success" ||
    run.repository?.full_name !== repository ||
    run.head_repository?.full_name !== repository ||
    run.actor?.id !== ownerId ||
    run.triggering_actor?.id !== ownerId ||
    !/^[a-f0-9]{40}$/.test(run.head_sha) ||
    !run.head_branch
  )
    throw new Error("信頼済みの最新 Preview deploy 成功 run ではありません");
}

function positiveInteger(value) {
  const text = String(value);
  if (!/^[1-9][0-9]*$/.test(text) || !Number.isSafeInteger(Number(text)))
    throw new Error("正の整数が必要です");
  return text;
}

function requireOfficialUrl(urls, hostname) {
  const expected = `https://${hostname}`;
  const found = urls?.find((value) => value === expected || value === `${expected}/`);
  if (!found) throw new Error("許可した Preview URL を公式応答で確認できません");
  return `${expected}/`;
}

async function requestJson(fetcher, url, token, options = {}) {
  let response;
  try {
    response = await fetcher(url, {
      method: options.method ?? "GET",
      redirect: "error",
      signal: AbortSignal.timeout(30000),
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch {
    throw new Error(
      options.method === "POST"
        ? "dispatch の成否不明です。run 一覧を確認するまで再送しないでください"
        : "対象照合 API に接続できません",
    );
  }
  if (!response.ok) throw new Error(`対象照合 API が HTTP ${response.status} を返しました`);
  return response.status === 204 ? undefined : response.json();
}
