import { describe, expect, it } from 'vitest';
import type { ScenarioEditorAiAttachmentDisclosure, ScenarioEditorAiRunSummary } from './types';

describe('scenario editor project AI contracts', () => {
  it('keeps AI run summary and attachment disclosure shapes explicit', () => {
    const summary = {
      appliedStepIds: ['step-1'],
      instruction: 'Update the step',
      requestedStepIds: ['step-1', 'step-2'],
      submittedAt: 123,
    } satisfies ScenarioEditorAiRunSummary;
    const disclosure = {
      mode: 'current',
      screenshotCount: 1,
      selectedStepId: 'step-1',
    } satisfies ScenarioEditorAiAttachmentDisclosure;

    expect(summary.appliedStepIds).toEqual(['step-1']);
    expect(disclosure.selectedStepId).toBe('step-1');
  });
});
