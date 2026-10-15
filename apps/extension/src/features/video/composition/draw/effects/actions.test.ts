import type { VideoCompositionActionState } from '../../types';
import { expect, it, vi } from 'vitest';
import { drawActionCompositionState, drawSceneActionCompositionStates } from './actions';

it('rounds gesture corners within the stroke width while preserving factual endpoints', () => {
  const context = createContext();
  const path = [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 20 },
  ];
  drawActionCompositionState(
    context,
    {
      ...createActionState(),
      preset: 'CLICK_PRESS',
      renderKind: 'accent',
      point: path[2]!,
      gestureFeedback: {
        effect: 'press',
        point: path[2]!,
        radius: 8,
        stroke: 4,
        color: '#ffffffff',
        opacity: 1,
        path,
      },
    },
    null
  );
  expect(context.moveTo).toHaveBeenCalledWith(0, 0);
  expect(context.lineTo).toHaveBeenCalledWith(16, 0);
  expect(context.quadraticCurveTo).toHaveBeenCalledWith(20, 0, 20, 4);
  expect(context.lineTo).toHaveBeenLastCalledWith(20, 20);
  expect(context.lineJoin).toBe('round');
  expect(path).toEqual([
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 20 },
  ]);
});

it('draws held feedback as a stable halo with the mapped factual path and authored frame', () => {
  const context = createContext();
  context.strokeRect = vi.fn();
  drawActionCompositionState(
    context,
    {
      ...createActionState(),
      preset: 'CLICK_PRESS',
      renderKind: 'accent',
      point: { x: 180, y: 150 },
      gestureFeedback: {
        effect: 'press',
        point: { x: 180, y: 150 },
        radius: 32,
        stroke: 2,
        color: '#ffffffff',
        opacity: 0.5,
        path: [
          { x: 52, y: 96 },
          { x: 180, y: 150 },
        ],
        area: { x: 100, y: 105, width: 160, height: 90 },
      },
    },
    null,
    0.5
  );
  expect(context.moveTo).toHaveBeenCalledWith(52, 96);
  expect(context.lineTo).toHaveBeenCalledWith(180, 150);
  expect(context.strokeRect).toHaveBeenCalledWith(100, 105, 160, 90);
  expect(context.arc).toHaveBeenCalledWith(180, 150, 16, 0, Math.PI * 2);
  expect(context.stroke).toHaveBeenCalledOnce();
  expect(context.fill).toHaveBeenCalledOnce();
  expect(context.globalAlpha).toBe(0.5);
});

it('draws an admitted keystroke label without a captured point', () => {
  const context = createContext();
  context.measureText = vi.fn(() => ({ width: 80 }) as TextMetrics);
  context.fillRect = vi.fn();
  context.fillText = vi.fn();
  drawActionCompositionState(
    context,
    {
      ...createActionState(),
      duration: 1,
      event: {
        id: 'key',
        kind: 'KEY',
        anchor: { kind: 'project', time: 0 },
        label: 'Ctrl + K',
        data: {},
        point: null,
      },
      preset: 'NONE',
      renderKind: 'keystroke',
      point: null,
      progress: 0.5,
      start: 0,
    },
    null
  );
  expect(context.fillText).toHaveBeenCalledWith('Ctrl + K', 960, expect.closeTo(1034.4, 8), 80);
  expect(context.save).toHaveBeenCalled();
  expect(context.restore).toHaveBeenCalledTimes(vi.mocked(context.save).mock.calls.length);
});

it('does not draw a NONE presentation for a click fact', () => {
  const context = createContext();
  drawActionCompositionState(
    context,
    {
      ...createActionState(),
      duration: 1,
      event: {
        id: 'a',
        kind: 'CLICK',
        anchor: { kind: 'project', time: 0 },
        label: 'Click',
        data: {},
        point: null,
      },
      preset: 'NONE',
      renderKind: null,
      point: { x: 40, y: 50 },
      progress: 0.5,
      start: 0,
    },
    null
  );
  expect(context.stroke).not.toHaveBeenCalled();
  expect(context.fill).not.toHaveBeenCalled();
});

function createContext() {
  return {
    globalAlpha: 1,
    roundRect: vi.fn(),
    arc: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    fill: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

it('renders every active action preset and supports fallback points', () => {
  const context = createContext();

  for (const preset of ['CLICK_RIPPLE', 'SPOTLIGHT', 'DWELL_ZOOM'] as const) {
    drawActionCompositionState(
      context,
      {
        ...createActionState(),
        duration: 1,
        preset,
        renderKind: 'accent',
        point: preset === 'CLICK_RIPPLE' ? null : { x: 40, y: 50 },
        progress: 0.5,
        start: 0,
      },
      { x: 42, y: 52 }
    );
  }

  expect(context.save).toHaveBeenCalledTimes(3);
  expect(context.restore).toHaveBeenCalledTimes(3);
  expect(context.arc).toHaveBeenCalled();
  expect(context.createRadialGradient).toHaveBeenCalledTimes(1);
  expect(context.quadraticCurveTo).not.toHaveBeenCalled();
});

it('returns early when neither the action nor fallback supplies a point', () => {
  const context = createContext();

  drawActionCompositionState(
    context,
    {
      ...createActionState(),
      duration: 1,
      event: createActionState().event,
      preset: 'CLICK_RIPPLE',
      renderKind: 'accent',
      point: null,
      progress: 0.2,
      start: 0,
    },
    null
  );

  expect(context.save).not.toHaveBeenCalled();
  expect(context.arc).not.toHaveBeenCalled();
});

it('scales action overlays with the preview size contract', () => {
  const context = createContext();

  drawActionCompositionState(
    context,
    {
      ...createActionState(),
      duration: 1,
      event: createActionState().event,
      preset: 'CLICK_RIPPLE',
      renderKind: 'accent',
      point: { x: 40, y: 50 },
      progress: 0.5,
      start: 0,
    },
    null,
    0.5
  );

  expect(context.arc).toHaveBeenCalledWith(40, 50, 16.5, 0, Math.PI * 2);
  expect(context.lineWidth).toBe(1.5);
});

it('does not cap large overlay scales in the preview size contract', () => {
  const context = createContext();

  drawActionCompositionState(
    context,
    {
      ...createActionState(),
      duration: 1,
      event: createActionState().event,
      preset: 'CLICK_RIPPLE',
      renderKind: 'accent',
      point: { x: 40, y: 50 },
      progress: 0.5,
      start: 0,
    },
    null,
    2.5
  );

  expect(context.arc).toHaveBeenCalledWith(40, 50, 82.5, 0, Math.PI * 2);
  expect(context.lineWidth).toBe(7.5);
});

function createActionState(): VideoCompositionActionState {
  const event = {
    id: 'event',
    kind: 'CLICK' as const,
    anchor: { kind: 'project' as const, time: 0 },
    point: null,
    label: 'Click',
    data: {},
  };
  return {
    event,
    occurrence: {
      event,
      eventId: event.id,
      clipId: null,
      time: 0,
      sourceInstanceId: null,
      playbackRun: null,
    },
    clipId: null,
    duration: 1,
    preset: 'CLICK_RIPPLE',
    renderKind: 'accent',
    point: null,
    progress: 0.5,
    start: 0,
  };
}

it('keeps the manual KEY default in the output viewport including padding, independent of scene zoom', () => {
  const context = createContext();
  context.measureText = vi.fn(() => ({ width: 80 }) as TextMetrics);
  context.fillRect = vi.fn();
  context.fillText = vi.fn();
  const state = createActionState();
  drawSceneActionCompositionStates(
    context,
    [
      {
        ...state,
        event: { ...state.event, kind: 'KEY', label: 'Ctrl + K' },
        renderKind: 'keystroke',
        preset: 'NONE',
      },
    ],
    {
      focusPoint: { x: 100, y: 50 },
      motionBlurAmount: 0,
      overlayZoomMode: 'LOCK_OVERLAYS',
      regionId: 'zoom',
      scale: 2,
      viewportWidth: 200,
      viewportHeight: 100,
      viewportX: 10,
      viewportY: 20,
    },
    { offsetX: 80, offsetY: 40, scaleX: 0.5, scaleY: 0.5 }
  );
  expect(context.fillText).toHaveBeenCalledWith('Ctrl + K', 180, 117.2, 80);
});

it('uses the authored click color, opacity and thickness with a deterministic envelope', () => {
  const context = createContext();
  const state = {
    ...createActionState(),
    progress: 0.5,
    clickStyle: { color: '#12abef', size: 60, opacity: 0.5, strokeWidth: 6 },
    easing: 'LINEAR' as const,
  };
  drawActionCompositionState(context, state, { x: 40, y: 50 }, 2);
  expect(context.strokeStyle).toBe('#12abef');
  expect(context.lineWidth).toBe(12);
  expect(context.globalAlpha).toBe(0.25);
  expect(context.arc).toHaveBeenCalledWith(40, 50, expect.closeTo(78, 8), 0, Math.PI * 2);
});
