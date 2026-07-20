import { describe, expect, it } from 'vitest';

import {
  cancelButtonClassName,
  exportSectionContainerClassName,
  progressDescriptionClassName,
  progressErrorListClassName,
  progressHeaderClassName,
  progressStepActiveClassName,
  progressStepBadgeClassName,
  progressStepDoneClassName,
  progressStepDividerClassName,
  progressStepErrorClassName,
  progressStepIdleClassName,
  progressStepLabelClassName,
  progressStepLabelWrapClassName,
  progressStepListClassName,
  progressStepRowClassName,
} from './styles';

describe('progress styles', () => {
  it('exports stable class names for all progress view building blocks', () => {
    expect(progressHeaderClassName).toContain('rounded-[12px]');
    expect(progressDescriptionClassName).toContain('text-[11px]');
    expect(progressStepListClassName).toContain('flex-col');
    expect(progressStepRowClassName).toContain('min-h-[30px]');
    expect(progressStepLabelWrapClassName).toContain('flex-1');
    expect(progressStepLabelClassName).toContain('text-[12px]');
    expect(progressStepDividerClassName).toContain('border-dashed');
    expect(progressStepBadgeClassName).toContain('rounded-full');
    expect(progressStepActiveClassName).toContain('accent');
    expect(progressStepDoneClassName).toContain('success');
    expect(progressStepErrorClassName).toContain('danger');
    expect(progressStepIdleClassName).toContain('text-[var(--sniptale-color-text-dim)]');
    expect(progressErrorListClassName).toContain('text-[10px]');
    expect(cancelButtonClassName).toContain('justify-center');
    expect(exportSectionContainerClassName).toContain('flex-1');
  });
});
