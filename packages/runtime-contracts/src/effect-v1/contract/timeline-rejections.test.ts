import { expect, it } from 'vitest';

import { createEffectV1Diagnostics } from '../model/diagnostics';
import { validateEffectV1MotionPaths } from '../timeline/motion-path';
import { validateEffectV1Timeline } from '../timeline/validation';

it('reports malformed timeline and motion-path collection shapes', () => {
  const report = createEffectV1Diagnostics();
  const layers = new Map([['group', { id: 'group', type: 'group' }]]);
  validateEffectV1Timeline(
    {
      phases: [null, { duration: 1, enabled: 'yes', id: 'phase', locked: 'no', start: 0 }],
      tracks: [
        null,
        { enabled: 'yes', id: 'track', keyframes: 'invalid', target: 'missing' },
        {
          id: 'group-track',
          keyframes: [null, { handles: [], id: 'key', time: 3 }],
          target: 'group',
        },
      ],
    },
    layers,
    new Map(),
    2,
    report
  );
  validateEffectV1MotionPaths('invalid', [], layers, report);
  validateEffectV1MotionPaths(
    [
      null,
      { layerId: 'group', points: 'invalid' },
      { layerId: 'group', points: [null, { inTangent: [] }] },
    ],
    [null, { keyframes: [null, { id: 'key' }] }],
    layers,
    report
  );

  expect(report.diagnostics.map(({ code }) => code)).toEqual(
    expect.arrayContaining([
      'PHASE_TYPE',
      'TRACK_TYPE',
      'KEYFRAMES_TYPE',
      'KEYFRAME_TYPE',
      'KEYFRAME_HANDLES',
      'BOOLEAN',
      'MOTION_PATHS_TYPE',
      'MOTION_PATH_TYPE',
      'MOTION_PATH_POINTS',
      'MOTION_POINT_TYPE',
      'MOTION_TANGENT_TYPE',
    ])
  );
});
