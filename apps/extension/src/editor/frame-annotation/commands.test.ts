import { expect, it } from 'vitest';
import { applyFrameAnnotationCommand } from './commands';
import type { FrameAnnotationSnapshotV1 } from '../../features/highlighter/frame-annotation';

const frame: FrameAnnotationSnapshotV1 = {
  version: 1,
  ordering: 0,
  id: 'frame-1',
  x: 10,
  y: 20,
  width: 100,
  height: 60,
  effectMode: 'border',
};

it('applies the shared visual commands without changing frame identity or ordering', () => {
  const focused = applyFrameAnnotationCommand(frame, 'effect-focus');
  const badged = applyFrameAnnotationCommand(focused, 'step-badge');
  const calledOut = applyFrameAnnotationCommand(badged, 'callout');
  expect(calledOut).toMatchObject({
    id: 'frame-1',
    ordering: 0,
    effectMode: 'focus',
    stepBadge: { enabled: true },
    callout: { enabled: true },
  });
});

it('changes logical canvas geometry and preserves the canonical proxy discriminator outside commands', () => {
  expect(applyFrameAnnotationCommand(frame, 'increase')).toMatchObject({
    x: 5,
    y: 15,
    width: 110,
    height: 70,
  });
  expect(applyFrameAnnotationCommand(frame, 'decrease')).toMatchObject({
    x: 15,
    y: 25,
    width: 90,
    height: 50,
  });
});
