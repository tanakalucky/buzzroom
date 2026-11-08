import { resolvePreview } from './preview-e2e-adapter.mjs';

// Called only from trusted default-branch code. No PR code or dependencies here.
export async function verify({ github, context, inputs = context.payload.inputs, resolve = resolvePreview }) {
  validateInputs(inputs);
  const { owner, repo } = context.repo;
  const repository = (await github.rest.repos.get({ owner, repo })).data;
  if (context.ref !== `refs/heads/${repository.default_branch}`) {
    throw new Error('Dispatch ref must be the trusted default branch.');
  }

  const run = (await github.rest.actions.getWorkflowRun({
    owner, repo, run_id: Number(inputs.source_run_id),
  })).data;
  if (run.path !== '.github/workflows/preview-deploy.yml'
      || run.repository.full_name !== `${owner}/${repo}`
      || run.status !== 'completed' || run.conclusion !== 'success'
      || String(run.run_attempt) !== inputs.source_run_attempt) {
    throw new Error('Source workflow, completion, repository or attempt does not match.');
  }

  const pull = (await github.rest.pulls.get({
    owner, repo, pull_number: Number(inputs.pr_number),
  })).data;
  if (pull.state !== 'open' || pull.head.sha !== inputs.head_sha
      || pull.head.repo?.full_name !== `${owner}/${repo}`) {
    throw new Error('PR is closed, stale or from a different repository.');
  }

  // The adapter must prove the source run deployed THIS PR/SHA, not run.head_sha alone.
  const preview = await resolve({ github, context, inputs, run, pull });
  const url = new URL(preview.url);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
      || url.pathname !== '/' || !/^[a-z0-9.-]+$/.test(url.hostname)
      || !/^[A-Za-z0-9_-]{1,128}$/.test(preview.version)
      || preview.version !== inputs.deployment_id) {
    throw new Error('Adapter returned an invalid URL or a different deployment version.');
  }
  return { url: url.href, version: preview.version };
}

// Use from a trusted Actions job after preview deploy completion has been verified.
// github is an Octokit client configured with automatic POST retries disabled.
export async function dispatch({ github, context, inputs, resolve = resolvePreview }) {
  await verify({ github, context, inputs, resolve });
  const { owner, repo } = context.repo;
  const workflow_id = 'preview-e2e.yml';
  const title = `Preview E2E / source ${inputs.source_run_id} attempt ${inputs.source_run_attempt}`;
  const runs = await github.paginate(github.rest.actions.listWorkflowRuns, {
    owner, repo, workflow_id, event: 'workflow_dispatch', per_page: 100,
  });
  const existing = runs.filter(run => run.display_title === title);
  if (existing.length) {
    throw new Error('An E2E run already exists for this source run/attempt. Inspect it before retrying.');
  }

  // A 204 accepts the request; it does not prove that E2E started or passed.
  // On a timeout/unknown response inspect workflow runs; do not blindly resend.
  await github.rest.actions.createWorkflowDispatch({
    owner, repo, workflow_id, ref: context.ref.replace('refs/heads/', ''), inputs,
  });
}

function validateInputs(inputs) {
  const keys = ['source_run_id', 'source_run_attempt', 'pr_number', 'head_sha', 'deployment_id'];
  if (!inputs || Object.keys(inputs).sort().join() !== keys.sort().join()) {
    throw new Error('Exactly the five documented dispatch inputs are required.');
  }
  if (keys.some(key => typeof inputs[key] !== 'string')) {
    throw new Error('Dispatch input values must be strings.');
  }
  for (const key of ['source_run_id', 'source_run_attempt', 'pr_number']) {
    if (!/^[1-9][0-9]*$/.test(inputs[key]) || !Number.isSafeInteger(Number(inputs[key]))) {
      throw new Error(`Invalid ${key}.`);
    }
  }
  if (!/^[0-9a-f]{40}$/.test(inputs.head_sha)
      || !/^[A-Za-z0-9_-]{1,128}$/.test(inputs.deployment_id)) {
    throw new Error('Invalid head SHA or immutable deployment/version ID.');
  }
}
