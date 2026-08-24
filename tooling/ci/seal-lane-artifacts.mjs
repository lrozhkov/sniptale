import path from 'node:path';

import { collectLaneArtifacts } from './artifacts.mjs';
import { resolveCiArtifactSession } from './artifact-observability.mjs';
import { formatObservedRunSummary } from '../qa/wrappers/observed/output.mjs';

export function sealLaneArtifacts(
  { artifactInput, label, lane, phases, startedAtMs },
  { artifactCollector = collectLaneArtifacts, sessionResolver = resolveCiArtifactSession } = {}
) {
  let session = null;
  let finalized = false;
  let artifactCollectionTerminal = false;
  let finalRecord = null;
  try {
    session = sessionResolver({ lane, phases, startedAtMs });
    session.recordActivityTransition({
      activityId: 'artifact-collection',
      kind: 'artifact-collection',
      state: 'queued',
    });
    session.recordActivityTransition({
      activityId: 'artifact-collection',
      kind: 'artifact-collection',
      state: 'started',
    });
    const artifactPath = artifactCollector({
      ...artifactInput,
      lane,
      phases,
      startedAtMs,
      beforeCollectRunRecords: () => {
        session.recordActivityTransition({
          activityId: 'artifact-collection',
          kind: 'artifact-collection',
          state: 'completed',
        });
        artifactCollectionTerminal = true;
        finalRecord = session.finalize();
        finalized = true;
      },
    });
    process.stdout.write(
      `[ci:final-summary]\n${formatObservedRunSummary({
        label,
        record: finalRecord,
        runPath: path.relative(process.cwd(), session.runPath).replaceAll(path.sep, '/'),
      })}`
    );
    process.stdout.write(`SNIPTALE_ARTIFACT_PATH=${artifactPath}\n`);
    return true;
  } catch (error) {
    let lifecycleError = null;
    try {
      if (session && !finalized) {
        if (!artifactCollectionTerminal) {
          session.recordActivityTransition({
            activityId: 'artifact-collection',
            kind: 'artifact-collection',
            state: 'failed',
          });
        }
        session.fail(error, {
          stepId: 'wrapper.lifecycle',
          problemId: 'artifact.collection.failed',
        });
      } else if (session) {
        session.resume();
        session.recordActivityTransition({
          activityId: 'artifact-sealing',
          kind: 'artifact-sealing',
          state: 'queued',
        });
        session.recordActivityTransition({
          activityId: 'artifact-sealing',
          kind: 'artifact-sealing',
          state: 'started',
        });
        session.recordActivityTransition({
          activityId: 'artifact-sealing',
          kind: 'artifact-sealing',
          state: 'failed',
        });
        session.fail(error, {
          stepId: 'wrapper.lifecycle',
          problemId: 'artifact.sealing.failed',
        });
      }
    } catch (caught) {
      lifecycleError = caught;
    }
    process.stderr.write(
      `Artifact collection failed: ${error instanceof Error ? error.message : String(error)}\n`
    );
    if (lifecycleError) {
      process.stderr.write(
        `Artifact failure recording failed: ${
          lifecycleError instanceof Error ? lifecycleError.message : String(lifecycleError)
        }\n`
      );
    }
    return false;
  }
}
