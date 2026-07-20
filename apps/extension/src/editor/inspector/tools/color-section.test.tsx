import React from 'react';
import { expect, it, vi } from 'vitest';
import { ToolColorSection } from './color-section';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

it('builds a compact color row with shared patch handlers', () => {
  const applyPatch = vi.fn();
  const updateColor = vi.fn((setter: (next: string) => void, color: string) => setter(color));
  const previewColor = vi.fn((setter: (next: string) => void, color: string) => setter(color));
  const panel = ToolColorSection({
    applyPatch,
    createPatch: (color: string) => ({ color }),
    palette: ['#000000'],
    previewColor,
    recentColors: ['#ffffff'],
    titleKey: 'editor.compact.stepColor',
    updateColor,
    value: '#123456',
  }) as React.ReactElement<any>;

  expect(panel.props.label).toBe('editor.compact.stepColor');
  expect(panel.props.title).toBe('editor.compact.stepColor');
  expect(panel.props.recentColors).toEqual(['#ffffff']);
  panel.props.onPreviewReset('#abcdef');
  expect(previewColor).toHaveBeenCalledWith(expect.any(Function), '#abcdef');
  expect(applyPatch).toHaveBeenCalledWith({ color: '#abcdef' });
});
