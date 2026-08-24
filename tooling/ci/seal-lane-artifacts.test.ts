import { expect, it, vi } from 'vitest';

import { sealLaneArtifacts } from './seal-lane-artifacts.mjs';

it('does not repeat a terminal artifact transition when finalization fails', () => {
  const transitions: Array<{ activityId: string; state: string }> = [];
  const session = {
    runPath: '/tmp/run.json',
    recordActivityTransition(input: { activityId: string; state: string }) {
      transitions.push(input);
    },
    finalize() {
      throw new Error('invalid timeline fixture');
    },
    fail() {
      throw new Error('timeline remains invalid');
    },
    resume: vi.fn(),
  };
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

  const sealed = sealLaneArtifacts(
    {
      artifactInput: {},
      label: 'CI proof',
      lane: 'proof',
      phases: [],
      startedAtMs: Date.now(),
    },
    {
      artifactCollector: ({ beforeCollectRunRecords }: { beforeCollectRunRecords: () => void }) => {
        beforeCollectRunRecords();
        return '/tmp/artifact';
      },
      sessionResolver: () => session,
    }
  );

  expect(sealed).toBe(false);
  expect(
    transitions
      .filter(({ activityId }) => activityId === 'artifact-collection')
      .map(({ state }) => state)
  ).toEqual(['queued', 'started', 'completed']);
  expect(stderr).toHaveBeenCalledWith(
    expect.stringContaining('Artifact failure recording failed: timeline remains invalid')
  );
  stderr.mockRestore();
});
