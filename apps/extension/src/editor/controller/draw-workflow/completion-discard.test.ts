import { expect, it, vi } from 'vitest';
import { createDiscardDrawWorkflowState } from './completion-discard';

it('syncs discarded draw workflow state even when no transient object remains', () => {
  const canvas = { remove: vi.fn() };
  const syncRuntimeState = vi.fn();

  expect(
    createDiscardDrawWorkflowState(
      canvas as never,
      { object: null, tool: 'rectangle' } as never,
      syncRuntimeState
    )
  ).toEqual({
    cropGuide: null,
    cropSelection: null,
    drawSession: null,
  });
  expect(canvas.remove).not.toHaveBeenCalled();
  expect(syncRuntimeState).toHaveBeenCalledOnce();
});

it('restores crop guide hit testing after an undersized draft is discarded', () => {
  const canvas = { remove: vi.fn(), skipTargetFind: true };
  createDiscardDrawWorkflowState(canvas as never, { object: null, tool: 'crop' } as never, vi.fn());
  expect(canvas.skipTargetFind).toBe(false);
});
