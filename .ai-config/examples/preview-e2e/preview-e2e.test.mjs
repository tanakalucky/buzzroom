import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatch, verify } from './preview-e2e.mjs';

const sha = 'a'.repeat(40);

test('必須adapterが未設定なら成功にせず停止する', async () => {
  const args = fixture();
  delete args.resolve;

  await assert.rejects(verify(args), /adapter is not configured/);
});

test('sourceと現在PRを照合した結果だけを返す', async () => {
  const args = fixture();

  const preview = await verify(args);

  assert.deepEqual(preview, { url: 'https://pr-7.example.test/', version: 'version-1' });
  assert.deepEqual(args.calls, ['repository', 'run', 'pull', 'provider']);
});

test('余分な入力URLや不正なIDはAPI呼出前に拒否する', async () => {
  for (const update of [{ preview_url: 'https://evil.test' }, { source_run_id: '1;echo bad' },
    { pr_number: 7 }, { source_run_attempt: '9007199254740992' }, { head_sha: 'main' },
    { deployment_id: '../other' }]) {
    const args = fixture();
    Object.assign(args.context.payload.inputs, update);

    await assert.rejects(verify(args));

    assert.deepEqual(args.calls, []);
  }
});

test('default以外のbranchではproviderを呼ばない', async () => {
  const args = fixture();
  args.context.ref = 'refs/heads/untrusted';

  await assert.rejects(verify(args), /trusted default branch/);

  assert.deepEqual(args.calls, ['repository']);
});

test('別workflowと失敗や別attemptのsourceを拒否する', async () => {
  for (const update of [{ path: '.github/workflows/other.yml' }, { conclusion: 'failure' },
    { status: 'in_progress' }, { run_attempt: 2 }, { repository: { full_name: 'other/repo' } }]) {
    const args = fixture();
    Object.assign(args.run, update);

    await assert.rejects(verify(args), /Source workflow/);

    assert.equal(args.calls.includes('provider'), false);
  }
});

test('closedと古いheadとforkのPRを拒否する', async () => {
  for (const update of [{ state: 'closed' }, { head: { sha: 'b'.repeat(40) } },
    { head: { sha, repo: { full_name: 'fork/app' } } }]) {
    const args = fixture();
    Object.assign(args.pull, update);

    await assert.rejects(verify(args), /PR is closed, stale/);

    assert.equal(args.calls.includes('provider'), false);
  }
});

test('API失敗とprovider照合失敗を成功へ変換しない', async () => {
  const args = fixture();
  args.resolve = async () => { throw new Error('provider mismatch'); };

  await assert.rejects(verify(args), /provider mismatch/);

  args.github.rest.actions.getWorkflowRun = async () => { throw new Error('403'); };
  await assert.rejects(verify(args), /403/);
});

test('不正URLと異なるversionを拒否する', async () => {
  for (const update of [{ url: 'http://pr-7.example.test/' }, { url: 'https://user:pass@example.test/' },
    { url: 'https://pr-7.example.test/?secret=x' }, { url: 'https://pr-7.example.test/path' },
    { version: 'version-2' }, { version: '<script>' }]) {
    const args = fixture();
    args.resolve = async () => ({ url: 'https://pr-7.example.test/', version: 'version-1', ...update });

    await assert.rejects(verify(args), /invalid URL or a different deployment/);
  }
});

test('検証後に全ページ検索し固定workflowへ1回だけdispatchする', async () => {
  const args = fixture();

  await dispatch({ ...args, inputs: args.context.payload.inputs });

  assert.equal(args.dispatched.length, 1);
  assert.equal(args.dispatched[0].workflow_id, 'preview-e2e.yml');
  assert.equal(args.dispatched[0].ref, 'main');
  assert.deepEqual(args.dispatched[0].inputs, args.context.payload.inputs);
  assert.deepEqual(args.calls, ['repository', 'run', 'pull', 'provider', 'paginate', 'dispatch']);
});

test('GitHub Contextのprototype getterを失わずdispatchする', async () => {
  const args = fixture();
  const repository = args.context.repo;
  delete args.context.repo;
  Object.setPrototypeOf(args.context, { get repo() { return repository; } });

  await dispatch({ ...args, inputs: args.context.payload.inputs });

  assert.equal(args.dispatched.length, 1);
});

test('既存runが見つかった場合はPOSTしない', async () => {
  const args = fixture();
  args.runs.push({ display_title: 'Preview E2E / source 12 attempt 1' });

  await assert.rejects(dispatch({ ...args, inputs: args.context.payload.inputs }), /already exists/);

  assert.equal(args.dispatched.length, 0);
});

test('dispatchの応答不明時に自動再送しない', async () => {
  const args = fixture();
  args.github.rest.actions.createWorkflowDispatch = async () => {
    args.dispatched.push('unknown');
    throw new Error('timeout');
  };

  await assert.rejects(dispatch({ ...args, inputs: args.context.payload.inputs }), /timeout/);

  assert.equal(args.dispatched.length, 1);
});

function fixture() {
  const calls = [];
  const dispatched = [];
  const runs = [];
  const run = { path: '.github/workflows/preview-deploy.yml', status: 'completed',
    conclusion: 'success', run_attempt: 1, repository: { full_name: 'owner/app' } };
  const pull = { state: 'open', head: { sha, repo: { full_name: 'owner/app' } } };
  const context = { repo: { owner: 'owner', repo: 'app' }, ref: 'refs/heads/main', payload: { inputs: {
    source_run_id: '12', source_run_attempt: '1', pr_number: '7', head_sha: sha, deployment_id: 'version-1',
  } } };
  const github = { rest: {
    repos: { get: async () => { calls.push('repository'); return { data: { default_branch: 'main' } }; } },
    actions: {
      getWorkflowRun: async () => { calls.push('run'); return { data: run }; },
      listWorkflowRuns: Symbol('list runs'),
      createWorkflowDispatch: async body => { calls.push('dispatch'); dispatched.push(body); },
    },
    pulls: { get: async () => { calls.push('pull'); return { data: pull }; } },
  }, paginate: async (method, query) => {
    assert.equal(method, github.rest.actions.listWorkflowRuns);
    assert.equal(query.event, 'workflow_dispatch');
    calls.push('paginate');
    return runs;
  } };
  const resolve = async () => {
    calls.push('provider');
    return { url: 'https://pr-7.example.test/', version: 'version-1' };
  };
  return { github, context, resolve, calls, dispatched, runs, run, pull };
}
