import { isExecutedAsScript } from '../qa/core/shared.mjs';
import { runObservedWrapper } from '../qa/wrappers/observed/runner.mjs';
import { collectCiReleaseResults } from './qa-composition.mjs';

if (isExecutedAsScript(import.meta.url)) {
  const outcome = await runObservedWrapper({
    wrapperId: 'ci:release',
    label: 'CI release',
    blocking: true,
    execute: ({ session }) =>
      collectCiReleaseResults({
        session,
        reuseFastProof: process.env.SNIPTALE_REUSE_FAST_PROOF === '1',
      }),
  });
  process.exitCode = outcome.exitCode;
}
