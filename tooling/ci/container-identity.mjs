export function resolveContainerDigest(imageReference, inspectImageId) {
  const immutableReferenceDigest = imageReference.match(/@(sha256:[a-f0-9]{64})$/u)?.[1] ?? null;
  const digest = immutableReferenceDigest ?? inspectImageId();
  if (!/^sha256:[a-f0-9]{64}$/u.test(digest)) {
    throw new Error(`Unable to resolve immutable container digest for ${imageReference}.`);
  }
  return digest;
}

export function resolveGithubRunIdentityEnvironment(env = process.env) {
  if (!env.GITHUB_RUN_ID) return [];
  if (!/^\d+$/u.test(env.GITHUB_RUN_ID)) {
    throw new Error('Canonical GitHub CI requires a numeric GITHUB_RUN_ID.');
  }
  if (!/^[1-9]\d*$/u.test(env.GITHUB_RUN_ATTEMPT ?? '')) {
    throw new Error('Canonical GitHub CI requires a positive GITHUB_RUN_ATTEMPT.');
  }
  return [`GITHUB_RUN_ID=${env.GITHUB_RUN_ID}`, `GITHUB_RUN_ATTEMPT=${env.GITHUB_RUN_ATTEMPT}`];
}
