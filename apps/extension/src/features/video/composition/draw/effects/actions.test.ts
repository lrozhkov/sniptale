import type { VideoCompositionActionState } from '../../types';
import { expect, it, vi } from 'vitest';
import { drawActionCompositionState, drawSceneActionCompositionStates } from './actions';

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
  expect(context.fillText).toHaveBeenCalledWith('Ctrl + K', 36, 48, 80);
  expect(context.restore).toHaveBeenCalledTimes(1);
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

  expect(context.arc).toHaveBeenCalledWith(40, 50, 16, 0, Math.PI * 2);
  expect(context.lineWidth).toBe(2);
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

  expect(context.arc).toHaveBeenCalledWith(40, 50, 80, 0, Math.PI * 2);
  expect(context.lineWidth).toBe(10);
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
  expect(context.fillText).toHaveBeenCalledWith('Ctrl + K', 98, 64, 80);
});
