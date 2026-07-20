import { expect, it } from 'vitest';

import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { createVideoPreviewCacheSegmentPlan } from './segments';

it('splits a range into contiguous two-second segments', async () => {
  const project = { ...createEmptyVideoProject('Segments'), duration: 4.5, fps: 10 };

  const segments = await createVideoPreviewCacheSegmentPlan(project, {
    endFrame: 45,
    startFrame: 5,
  });

  expect(
    segments.map(({ endFrame, index, startFrame }) => ({ endFrame, index, startFrame }))
  ).toEqual([
    { endFrame: 25, index: 0, startFrame: 5 },
    { endFrame: 45, index: 1, startFrame: 25 },
  ]);
  expect(segments.every((segment) => /^sha256:[a-f0-9]{64}$/u.test(segment.fingerprint))).toBe(
    true
  );
});
