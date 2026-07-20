import { expect, it } from 'vitest';
import {
  createScenarioCaptureStep,
  createScenarioDividerStep,
  createScenarioProject,
} from '../../features/scenario/project/public';
import { buildCaptureStepTimeline, buildCursorSamples, resolveInteractionPoint } from './timeline';

it('builds timeline entries only for capture steps', () => {
  const project = {
    ...createScenarioProject('Timeline'),
    steps: [
      createScenarioDividerStep(),
      { ...createScenarioCaptureStep({ assetId: 'asset-1', title: 'Capture 1' }), id: 'capture-1' },
      { ...createScenarioCaptureStep({ assetId: 'asset-2', title: 'Capture 2' }), id: 'capture-2' },
    ],
  };

  expect(buildCaptureStepTimeline(project, 3)).toEqual([
    expect.objectContaining({
      end: 3,
      start: 0,
      step: expect.objectContaining({ id: 'capture-1' }),
    }),
    expect.objectContaining({
      end: 6,
      start: 3,
      step: expect.objectContaining({ id: 'capture-2' }),
    }),
  ]);
});

it('resolves interaction points from click overlays before step metadata', () => {
  const step = createScenarioCaptureStep({
    assetId: 'asset-1',
    interactionPoint: { x: 10, y: 20 },
    overlays: [{ id: 'ring-1', kind: 'click-ring', point: { x: 30, y: 40 } }],
  });

  expect(resolveInteractionPoint(step)).toEqual({ x: 30, y: 40 });
});

it('builds visible, overlay-driven, and hidden cursor samples', () => {
  const overlayCursorStep = {
    ...createScenarioCaptureStep({
      assetId: 'asset-1',
      overlays: [{ id: 'cursor-1', kind: 'cursor', point: { x: 100, y: 120 } }],
    }),
    id: 'capture-1',
  };
  const hiddenCursorStep = {
    ...createScenarioCaptureStep({ assetId: 'asset-2' }),
    id: 'capture-2',
  };

  expect(
    buildCursorSamples([
      { end: 4, start: 0, step: overlayCursorStep },
      { end: 8, start: 4, step: hiddenCursorStep },
    ])
  ).toEqual([
    { id: 'capture-1:cursor:start', time: 0, visible: true, x: 100, y: 120 },
    { id: 'capture-1:cursor:end', time: 3.99, visible: true, x: 100, y: 120 },
    { id: 'capture-2:cursor:hidden:start', time: 4, visible: false, x: 0, y: 0 },
  ]);
});
