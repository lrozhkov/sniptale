import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FrameData } from '../../../../features/highlighter/contracts';

const placement = vi.hoisted(() => ({
  fallbackSide: 'top' as 'top' | 'bottom',
  getFrameTriggerPosition: vi.fn(
    (
      _frame: FrameData,
      _controlCount: number,
      _uiScale: number,
      lockedSide?: 'top' | 'bottom'
    ) => ({
      direction: 'row' as const,
      height: 26,
      side: lockedSide ?? placement.fallbackSide,
      width: 86,
      x: 100,
      y: 87,
    })
  ),
}));

vi.mock('./trigger-position', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./trigger-position')>()),
  getFrameTriggerPosition: placement.getFrameTriggerPosition,
}));

import {
  resolveStableFrameTriggerPosition,
  suspendFrameTriggerPlacement,
} from './trigger-placement-session';

const frame = { height: 80, id: 'frame-1', width: 240, x: 100, y: 100 } as FrameData;

beforeEach(() => {
  placement.fallbackSide = 'top';
  placement.getFrameTriggerPosition.mockClear();
});

describe('frame trigger placement session', () => {
  it('retains its side while visible and across a brief hover gap', () => {
    const initial = resolveStableFrameTriggerPosition({
      controlCount: 3,
      frame,
      now: 1_000,
      session: null,
      uiScale: 1,
    });
    placement.fallbackSide = 'bottom';

    const visible = resolveStableFrameTriggerPosition({
      controlCount: 3,
      frame,
      now: 1_200,
      session: initial.session,
      uiScale: 1,
    });
    const brieflyHidden = suspendFrameTriggerPlacement(visible.session, 1_300);
    const restored = resolveStableFrameTriggerPosition({
      controlCount: 3,
      frame,
      now: 1_800,
      session: brieflyHidden,
      uiScale: 1,
    });

    expect(initial.position.side).toBe('top');
    expect(visible.position.side).toBe('top');
    expect(restored.position.side).toBe('top');
  });

  it('allows a fresh side after the hover grace period expires', () => {
    const suspended = suspendFrameTriggerPlacement(
      { frameId: frame.id, hiddenAt: null, side: 'top' },
      1_000
    );
    placement.fallbackSide = 'bottom';

    const restored = resolveStableFrameTriggerPosition({
      controlCount: 3,
      frame,
      now: 2_001,
      session: suspended,
      uiScale: 1,
    });

    expect(restored.position.side).toBe('bottom');
  });
});
