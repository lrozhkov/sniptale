import React from 'react';
import { expect, it, vi } from 'vitest';
import { StepValueInput } from './step-value-input';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

it('normalizes step value edits through the shared input', () => {
  const previewStepPatch = vi.fn();
  const commitPendingSelectionSettings = vi.fn();
  const input = StepValueInput({
    commitPendingSelectionSettings,
    previewStepPatch,
    settings: {
      alphabet: 'latin',
      color: '#000000',
      opacity: 1,
      sizeLevel: 10,
      strokeColor: '#ffffff',
      strokeOpacity: 1,
      strokeWidth: 2,
      textColor: '#ffffff',
      type: 'number',
      value: '1',
    },
  } as never) as React.ReactElement<any>;

  input.props.onChange({ currentTarget: { value: '123abc' } });
  input.props.onValueCommit();

  expect(input.props.label).toBe('editor.compact.stepValue');
  expect(input.props.inputClassName).toBe('text-center');
  expect(input.props.inputMode).toBe('numeric');
  expect(input.props.maxLength).toBe(2);
  expect(previewStepPatch).toHaveBeenCalledWith({ value: '12' });
  expect(commitPendingSelectionSettings).toHaveBeenCalledOnce();
});

it('allows manual step values up to three visible characters', () => {
  const previewStepPatch = vi.fn();
  const input = StepValueInput({
    commitPendingSelectionSettings: vi.fn(),
    previewStepPatch,
    settings: {
      alphabet: 'latin',
      color: '#000000',
      opacity: 1,
      sizeLevel: 10,
      strokeColor: '#ffffff',
      strokeOpacity: 1,
      strokeWidth: 2,
      textColor: '#ffffff',
      type: 'manual',
      value: '',
    },
  } as never) as React.ReactElement<any>;

  input.props.onChange({ currentTarget: { value: 'ABCD' } });

  expect(input.props.inputMode).toBe('text');
  expect(input.props.maxLength).toBe(3);
  expect(previewStepPatch).toHaveBeenCalledWith({ value: 'ABC' });
});
