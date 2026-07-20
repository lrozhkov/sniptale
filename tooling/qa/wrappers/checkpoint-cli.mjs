import { runObservedWrapper } from './observed/runner.mjs';

/** Keep CLI locking and process termination separate from checkpoint semantics and test injection. */
export async function runCheckpointCli({ runCheckpoint, argv = process.argv.slice(2) }) {
  const outcome = await runObservedWrapper({
    wrapperId: 'qa:checkpoint',
    label: 'QA checkpoint',
    argv,
    blocking: true,
    execute: async ({ session }) => runCheckpoint({ argv, producerRunId: session.runId }),
  });
  process.exitCode = outcome.exitCode;
  return outcome;
}
