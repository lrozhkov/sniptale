import React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: vi.fn((key: string) => key),
}));

vi.mock('../../chrome/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../chrome/ui')>()),
  CompactRange: (props: Record<string, unknown>) => React.createElement('mock-range', props),
  NumericRow: (props: Record<string, unknown>) => React.createElement('mock-numeric-row', props),
}));

vi.mock('./sections', () => ({
  CollapsibleSection: (props: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement('mock-collapsible', props, props.children),
  HeaderValueToggleSection: (props: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement('mock-toggle-section', props, props.children),
  PanelSection: (props: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement('mock-section', props, props.children),
  renderSelectionActionsSectionWithController: () => null,
}));

import { ShadowRangeSection } from './shadow';

type NumericRowElement = React.ReactElement<{
  label: string;
  onCommitValue: (value: number) => void;
  onPreviewValue: (value: number) => void;
  unit: string;
  value: number;
}>;

describe('ShadowRangeSection', () => {
  it('shows the default label as intensity and commits numeric updates', () => {
    const onChange = vi.fn();
    const onValueCommit = vi.fn();
    const row = ShadowRangeSection({ value: 30, onChange, onValueCommit }) as NumericRowElement;

    expect(row.props.label).toBe('highlighter.editor.shadowLabel');
    expect(row.props.unit).toBe('%');
    expect(row.props.value).toBe(30);

    row.props.onPreviewValue(57);
    row.props.onCommitValue(57);

    expect(onChange).toHaveBeenCalledWith(57);
    expect(onValueCommit).toHaveBeenCalledOnce();
  });

  it('keeps a custom label and commits without an optional commit callback', () => {
    const onChange = vi.fn();
    const row = ShadowRangeSection({
      label: 'shadow-label',
      onChange,
      value: 100,
    }) as NumericRowElement;

    expect(row.props.label).toBe('shadow-label');
    expect(row.props.value).toBe(100);

    row.props.onCommitValue(80);

    expect(onChange).toHaveBeenCalledWith(80);
  });
});
