import { isExecutedAsScript } from '../qa/runtime/process/shared-cli.mjs';
import { runObservedWrapper } from '../qa/wrappers/observed/runner.mjs';
import { collectCiProofResults } from './qa-composition.mjs';

if (isExecutedAsScript(import.meta.url)) {
  const outcome = await runObservedWrapper({
    wrapperId: 'ci:proof',
    label: 'CI proof',
    blocking: true,
    execute: ({ session }) => collectCiProofResults({ session }),
  });
  process.exitCode = outcome.exitCode;
}
