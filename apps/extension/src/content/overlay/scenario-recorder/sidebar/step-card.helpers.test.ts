import { describe, expect, it } from 'vitest';
import { getScenarioRecorderSidebarStepCardClassName } from './step-card.helpers';

describe('getScenarioRecorderSidebarStepCardClassName', () => {
  it('includes highlight styling only for the highlighted state', () => {
    expect(getScenarioRecorderSidebarStepCardClassName(true)).toContain(
      'animate-[pulse_1.6s_ease-out_1]'
    );
    expect(getScenarioRecorderSidebarStepCardClassName(false)).toContain('hover:border-');
  });
});
