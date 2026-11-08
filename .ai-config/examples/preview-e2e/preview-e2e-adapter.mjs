// Replace this function in the APPLICATION, then test it with provider/API fakes.
// The template deliberately cannot report success before that integration exists.
export async function resolvePreview({ github, context, inputs, run, pull }) {
  throw new Error('Preview adapter is not configured. Read the example README before enabling.');
}
