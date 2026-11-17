import { expect, it, vi } from 'vitest';
import { createReviewInteractionEditor } from './interaction-editor';
import { createReviewCommandFixture } from './editor-fixture.test-support';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import type { ReviewTelemetryMarker } from '../../features/video/review/telemetry';

type Input = Parameters<typeof createReviewInteractionEditor>[0];
function fixture() {
  const advanced = createQuickEditAdvancedState();
  const input: Input = {
    commands: createReviewCommandFixture(
      () => ({ duration: input.duration, time: input.time, resultTime: input.time, advanced }),
      { beforeAction: (action) => input.beforeAction(action) }
    ),
    advanced,
    duration: 10,
    time: 9.9,
    setMode: vi.fn(),
    setActiveSelection: vi.fn(),
    seek: vi.fn(),
    beforeAction: (action) => {
      action();
    },
    canStart: () => true,
    setInteractionTimeline: vi.fn((update) => {
      advanced.interactionTimeline = update(
        advanced.interactionTimeline ?? { presses: [], overrides: [] }
      );
    }),
    setKeyAnimations: vi.fn((update) => {
      advanced.keyAnimations = update(advanced.keyAnimations ?? []);
    }),
    setClickAnimations: vi.fn((update) => {
      advanced.clickAnimations = update(advanced.clickAnimations ?? []);
    }),
  };
  return { input, advanced, editor: createReviewInteractionEditor(input) };
}
const captured: ReviewTelemetryMarker = {
  ref: { kind: 'action', id: 'captured' },
  eventType: 'CLICK',
  target: 'Target',
  start: 2,
  end: 3,
  mouseButton: 2,
  focusPoint: { x: 0.2, y: 0.8 },
};

it('refuses blocked, invalid and cancelled commands without staging content', () => {
  const { input, editor } = fixture();
  for (const [start, end] of [
    [-1, 2],
    [1, 11],
    [3, 2],
    [NaN, 3],
  ])
    editor.update(captured, start!, end!);
  expect(input.setInteractionTimeline).not.toHaveBeenCalled();
  input.canStart = () => false;
  editor.add('mouse');
  editor.changePress('missing', { button: 1 });
  editor.update(captured, 2, 3);
  expect(input.setInteractionTimeline).not.toHaveBeenCalled();
  input.canStart = () => true;
  input.beforeAction = () => {};
  editor.add('keyboard');
  expect(input.setInteractionTimeline).not.toHaveBeenCalled();
  input.beforeAction = (action) => {
    action();
  };
  input.duration = 0.01;
  editor.add('keyboard');
  expect(input.setInteractionTimeline).not.toHaveBeenCalled();
});

it('retains captured presentation when retimed and protects captured facts from deletion', () => {
  const { input, advanced, editor } = fixture();
  editor.update(captured, 4, 5);
  expect(advanced.interactionTimeline?.overrides).toEqual([
    expect.objectContaining({
      ref: captured.ref,
      start: 4,
      end: 5,
      enabled: true,
      source: expect.objectContaining({ id: 'captured', x: 0.2, y: 0.8, button: 2 }),
    }),
  ]);
  editor.update({ ...captured, start: 4, end: 5 }, 6, 7);
  expect(advanced.interactionTimeline?.overrides).toHaveLength(1);
  expect(advanced.interactionTimeline?.overrides[0]).toMatchObject({
    start: 6,
    sourceRange: { start: 2, end: 3 },
  });
  vi.mocked(input.setInteractionTimeline).mockClear();
  editor.remove(captured);
  expect(input.setInteractionTimeline).not.toHaveBeenCalled();
  expect(captured.start).toBe(2);
});

it('copies authored mouse appearance, edits its position and disables only the selected authored press', () => {
  const { input, advanced, editor } = fixture();
  const added = vi.fn();
  editor.add('mouse', { kind: 'range', start: 9.9, end: 12 }, captured, added);
  expect(added).toHaveBeenCalledOnce();
  const first = advanced.interactionTimeline!.presses[0]!;
  expect(first).toMatchObject({ start: 9.9, end: 10, button: 2, x: 0.2, y: 0.8 });
  const next = createReviewInteractionEditor(input);
  next.changePress(first.id, { button: 1, x: 0.4 });
  expect(advanced.interactionTimeline!.presses[0]).toMatchObject({ button: 1, x: 0.4 });
  next.copy({ ...captured, ref: { kind: 'action', id: first.id } });
  expect(advanced.interactionTimeline!.presses).toHaveLength(2);
  expect(new Set(advanced.interactionTimeline!.presses.map((p) => p.id)).size).toBe(2);
  next.remove({ ...captured, ref: { kind: 'action', id: first.id } });
  expect(advanced.interactionTimeline!.overrides).toContainEqual(
    expect.objectContaining({
      ref: { kind: 'action', id: first.id },
      enabled: false,
    })
  );
  expect(input.setActiveSelection).toHaveBeenLastCalledWith({ kind: 'none' });
});
