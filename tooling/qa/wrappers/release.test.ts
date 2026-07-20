import { expect, it } from 'vitest';

function createToolingDiffContext() {
  return {
    targetFiles: ['tooling/qa/wrappers/release.mjs'],
    existingTargetFiles: ['tooling/qa/wrappers/release.mjs'],
    codeFiles: ['tooling/qa/wrappers/release.mjs'],
    jsLikeFiles: ['tooling/qa/wrappers/release.mjs'],
    fingerprint: 'tooling-diff',
  };
}

it('requires a fresh harness stamp before qa:release consumes tooling changes', async () => {
  const module = await import('./release.mjs');

  await expect(
    module.runReleaseWrapper({
      contextCollector: createToolingDiffContext,
      harnessStateAsserter: () => {
        throw new Error('Run npm run qa:release-harness for changed tooling/**');
      },
      verifyScope: {
        codeFiles: [],
        targetFiles: [],
      },
      fullVerifyCollector: async () => {
        throw new Error('release verify should not run');
      },
    })
  ).rejects.toThrow(/qa:release-harness/u);
}, 10_000);

it('runs release verification after tooling harness freshness is confirmed', async () => {
  const module = await import('./release.mjs');
  const result = await module.runReleaseWrapper({
    contextCollector: createToolingDiffContext,
    harnessStateAsserter: () => undefined,
    verifyScope: {
      codeFiles: [],
      targetFiles: [],
    },
    fullVerifyCollector: async ({ releaseMode }: { releaseMode: boolean }) => ({
      releaseMode,
      scopeDetail: '',
      steps: [],
    }),
  });

  expect(result.releaseMode).toBe(true);
});
