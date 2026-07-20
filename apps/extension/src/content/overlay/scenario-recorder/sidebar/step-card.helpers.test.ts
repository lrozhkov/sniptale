import { describe, expect, it, vi } from 'vitest';
import { getScenarioRecorderSidebarStepCardClassName, handleStepDrop } from './step-card.helpers';

describe('getScenarioRecorderSidebarStepCardClassName', () => {
  it('includes highlight styling only for the highlighted state', () => {
    expect(getScenarioRecorderSidebarStepCardClassName(true)).toContain(
      'animate-[pulse_1.6s_ease-out_1]'
    );
    expect(getScenarioRecorderSidebarStepCardClassName(false)).toContain('hover:border-');
  });
});

describe('handleStepDrop', () => {
  it('moves the dragged step to the current step position and clears drag ownership', () => {
    const onMoveStep = vi.fn();
    const setDragStepId = vi.fn();

    handleStepDrop({
      dragStepId: 'step-1',
      stepId: 'step-2',
      stepPosition: 3,
      onMoveStep,
      setDragStepId,
    });

    expect(onMoveStep).toHaveBeenCalledWith('step-1', 3);
    expect(setDragStepId).toHaveBeenCalledWith(null);
  });

  it('ignores missing or self-target drag drops', () => {
    const onMoveStep = vi.fn();
    const setDragStepId = vi.fn();

    handleStepDrop({
      dragStepId: null,
      stepId: 'step-2',
      stepPosition: 3,
      onMoveStep,
      setDragStepId,
    });
    handleStepDrop({
      dragStepId: 'step-2',
      stepId: 'step-2',
      stepPosition: 3,
      onMoveStep,
      setDragStepId,
    });

    expect(onMoveStep).not.toHaveBeenCalled();
    expect(setDragStepId).not.toHaveBeenCalled();
  });
});
