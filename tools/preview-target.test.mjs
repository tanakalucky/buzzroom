import { test } from "node:test";
import assert from "node:assert/strict";
import { createApi, dispatchTarget, resolveTarget, validateDeployment } from "./preview/target.mjs";

const sha = "a".repeat(40);
const deploymentId = "12345678-1234-1234-1234-123456789abc";
const input = { source_run_id: "123", source_run_attempt: "2" };

test("成功した本人の deploy と現在の open head・公式 immutable URL を結び付ける", async () => {
  const { api } = fixture();

  const target = await resolveTarget(api, input);

  assert.equal(target.head_sha, sha);
  assert.equal(target.pr_number, "15");
  assert.equal(target.deployment_id, deploymentId);
  assert.equal(target.deployment_url, "https://12345678-buzzroom.luckyyeslucky777.workers.dev/");
});

for (const [name, change] of [
  [
    "deploy の失敗",
    (s) => {
      s.run.conclusion = "failure";
    },
  ],
  [
    "deploy 中",
    (s) => {
      s.run.status = "in_progress";
    },
  ],
  [
    "別 workflow",
    (s) => {
      s.run.path = ".github/workflows/ci.yml";
    },
  ],
  [
    "fork",
    (s) => {
      s.run.head_repository.full_name = "other/buzzroom";
    },
  ],
  [
    "owner 以外の再実行",
    (s) => {
      s.run.triggering_actor.id = 1;
    },
  ],
  [
    "古い attempt",
    (s) => {
      s.run.run_attempt = 3;
    },
  ],
  [
    "deploy step の skip",
    (s) => {
      s.jobs[0].steps[0].conclusion = "skipped";
    },
  ],
  [
    "PR close",
    (s) => {
      s.pr.state = "closed";
    },
  ],
  [
    "新しい head",
    (s) => {
      s.pr.head.sha = "b".repeat(40);
    },
  ],
  [
    "別 PR の Preview",
    (s) => {
      s.preview.name = "pr-16";
    },
  ],
  [
    "古い deployment",
    (s) => {
      s.deployment.annotations["workers/commit_sha"] = "b".repeat(40);
    },
  ],
  [
    "本番 URL",
    (s) => {
      s.deployment.urls = ["https://buzzroom.tanakalucky.com/"];
    },
  ],
  [
    "外部 URL",
    (s) => {
      s.deployment.urls = ["https://12345678-buzzroom.luckyyeslucky777.workers.dev.evil.test/"];
    },
  ],
]) {
  test(`${name}を成功扱いせず API 起動前に拒否する`, async () => {
    const { api, state } = fixture();
    change(state);

    await assert.rejects(resolveTarget(api, input));

    assert.equal(state.writes.length, 0);
  });
}

test("受信後に version が変わった場合は同じ SHA でも拒否する", async () => {
  const { api } = fixture();

  await assert.rejects(
    resolveTarget(api, { ...input, deployment_id: "different" }),
    /deployment_id/,
  );
});

test("不正な run ID を URL や shell に展開しない", async () => {
  const { api } = fixture();

  await assert.rejects(
    resolveTarget(api, { ...input, source_run_id: "1/../../secrets" }),
    /正の整数/,
  );
});

test("URL の query・認証情報・HTTP を公式値として受け入れない", () => {
  for (const url of [
    "https://12345678-buzzroom.luckyyeslucky777.workers.dev/?key=x",
    "https://user:password@12345678-buzzroom.luckyyeslucky777.workers.dev/",
    "http://12345678-buzzroom.luckyyeslucky777.workers.dev/",
  ]) {
    const { state } = fixture();
    state.deployment.urls = [url];

    assert.throws(() => validateDeployment(state.preview, state.deployment, 15, sha));
  }
});

test("成功照合済みの5入力だけを main の workflow_dispatch に渡す", async () => {
  const { api, state } = fixture();
  const target = await resolveTarget(api, input);

  assert.deepEqual(await dispatchTarget(api, target), { dispatched: true });

  assert.deepEqual(state.writes, [
    {
      path: "/actions/workflows/preview-e2e.yml/dispatches",
      method: "POST",
      body: {
        ref: "main",
        inputs: { ...input, pr_number: "15", head_sha: sha, deployment_id: deploymentId },
      },
    },
  ]);
});

test("同じ source run と attempt が起動済みなら失敗済みでも重複送信しない", async () => {
  const { api, state } = fixture();
  state.runs = [
    {
      display_title: "Preview E2E 123/2",
      conclusion: "failure",
      html_url: "https://github.com/run",
    },
  ];

  const result = await dispatchTarget(api, await resolveTarget(api, input));

  assert.equal(result.dispatched, false);
  assert.equal(state.writes.length, 0);
});

test("GitHub 一覧の次ページも取得し末尾まで重複を確認する", async () => {
  const paths = [];
  const api = createApi(
    { GITHUB_REPOSITORY: "tanakalucky/buzzroom", GH_TOKEN: "fixture" },
    async (url) => {
      paths.push(url);
      const workflow_runs = paths.length === 1 ? Array(100).fill({}) : [{ id: 101 }];
      return Response.json({ workflow_runs });
    },
  );

  const runs = await api.githubPages(
    "/actions/workflows/preview-e2e.yml/runs?event=workflow_dispatch",
    "workflow_runs",
  );

  assert.equal(runs.length, 101);
  assert.match(paths[1], /&page=2$/);
});

test("dispatch の通信失敗は成否不明として一度で停止し token を出力しない", async () => {
  let calls = 0;
  const api = createApi(
    { GITHUB_REPOSITORY: "tanakalucky/buzzroom", GH_TOKEN: "secret-fixture" },
    async () => {
      calls++;
      throw new Error("secret-fixture");
    },
  );

  await assert.rejects(
    api.github("/actions/workflows/preview-e2e.yml/dispatches", { method: "POST", body: {} }),
    (error) => /成否不明/.test(error.message) && !error.message.includes("secret-fixture"),
  );

  assert.equal(calls, 1);
});

test("権限・認証エラーと redirect を成功として返さない", async () => {
  const api = createApi(
    { GITHUB_REPOSITORY: "tanakalucky/buzzroom", GH_TOKEN: "fixture" },
    async (_url, options) => {
      assert.equal(options.redirect, "error");
      return new Response("sensitive response", { status: 403 });
    },
  );

  await assert.rejects(api.github("/actions/runs/123"), /HTTP 403/);
});

function fixture() {
  const run = {
    id: 123,
    run_attempt: 2,
    path: ".github/workflows/preview-deploy.yml",
    event: "pull_request",
    status: "completed",
    conclusion: "success",
    head_sha: sha,
    head_branch: "feature/test",
    repository: { full_name: "tanakalucky/buzzroom" },
    head_repository: { full_name: "tanakalucky/buzzroom" },
    actor: { id: 39301079 },
    triggering_actor: { id: 39301079 },
  };
  const pr = {
    number: 15,
    state: "open",
    head: { sha, repo: { full_name: "tanakalucky/buzzroom" } },
    base: { repo: { full_name: "tanakalucky/buzzroom" } },
  };
  const preview = {
    name: "pr-15",
    slug: "pr-15",
    urls: ["https://pr-15-buzzroom.luckyyeslucky777.workers.dev"],
  };
  const deployment = {
    id: deploymentId,
    annotations: { "workers/commit_sha": sha },
    urls: ["https://12345678-buzzroom.luckyyeslucky777.workers.dev"],
  };
  const jobs = [
    {
      name: "deploy",
      conclusion: "success",
      steps: [{ name: "Preview の deploy", conclusion: "success" }],
    },
  ];
  const writes = [];
  const state = { run, pr, preview, deployment, jobs, runs: [], writes };
  const api = {
    github: async (path, options) => {
      if (options?.method === "POST") {
        writes.push({ path, ...options });
        return;
      }
      if (path === "/actions/runs/123") return state.run;
      if (path === "/pulls/15") return state.pr;
      throw new Error(`想定外のパス: ${path}`);
    },
    githubPages: async (path) => {
      if (path.includes("/jobs")) return state.jobs;
      if (path.startsWith("/pulls?")) return [state.pr];
      if (path.includes("/runs?")) return state.runs;
      throw new Error(`想定外の一覧: ${path}`);
    },
    cloudflare: async (path) => (path.endsWith("/latest") ? state.deployment : state.preview),
  };
  return { state, api };
}
