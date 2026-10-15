import { normalizeMediabunny } from './mediabunny/normalize.mjs';
import { isExecutedAsScript } from '../qa/runtime/process/shared-cli.mjs';
import { runObservedWrapper } from '../qa/wrappers/observed/runner.mjs';
import { collectCiProofResults } from './qa-composition.mjs';

/** Execute canonical proof after the caller has admitted its complete CI lifecycle. */
export function collectProofWrapperResults({ session }) {
  normalizeMediabunny();
  return collectCiProofResults({ session });
}

if (isExecutedAsScript(import.meta.url)) {
  const outcome = await runObservedWrapper({
    wrapperId: 'ci:proof',
    label: 'CI proof',
    blocking: true,
    execute: collectProofWrapperResults,
  });
  process.exitCode = outcome.exitCode;
}
