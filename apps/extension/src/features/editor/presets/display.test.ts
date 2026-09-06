import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createDefaultEditorPresetStorageState } from '../../../composition/persistence/editor-presets/defaults';
import { DEFAULT_BORDER_PRESET } from '../../highlighter/style/defaults';

const translateMock = vi.hoisted(() => vi.fn((key: string) => key));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: translateMock,
}));

import { getEditorPresetDisplayName, getEditorSystemPresetDisplayName } from './display';
import { renderEditorPresetPreview } from './preview';
import { renderBorderPresetPreview } from './preview';
import { sanitizeEditorComparableSettings, sanitizeEditorPresetSettings } from './settings';

describe('editor preset display labels', () => {
  it('projects a generic system label for editor-owned UI only when the preset is system-owned', () => {
    expect(getEditorSystemPresetDisplayName()).toBe('shared.defaults.defaultEditorPresetName');
    expect(
      getEditorPresetDisplayName({
        isSystemDefault: true,
        name: 'shared.defaults.defaultBorderPresetName',
      })
    ).toBe('shared.defaults.defaultEditorPresetName');
    expect(
      getEditorPresetDisplayName({
        isSystemDefault: false,
        name: 'Rectangle from editor 1',
      })
    ).toBe('Rectangle from editor 1');
    expect(translateMock).toHaveBeenCalledWith('shared.defaults.defaultEditorPresetName');
  });
});

describe('current editor preset projections', () => {
  it('renders step and scene background previews', () => {
    const defaults = createDefaultEditorPresetStorageState();
    const step = renderToStaticMarkup(renderEditorPresetPreview('step', defaults.step.presets[0]!));
    const scene = renderToStaticMarkup(
      renderEditorPresetPreview('sceneBackground', defaults.sceneBackground.presets[0]!)
    );

    expect(step).toContain('rounded-full');
    expect(scene).toContain('border-white/20');

    const alphabetic = renderToStaticMarkup(
      renderEditorPresetPreview('step', {
        ...defaults.step.presets[0]!,
        settings: { ...defaults.step.presets[0]!.settings, type: 'letter', value: '' },
      })
    );
    const numericFallback = renderToStaticMarkup(
      renderEditorPresetPreview('step', {
        ...defaults.step.presets[0]!,
        settings: { ...defaults.step.presets[0]!.settings, type: 'number', value: '' },
      })
    );
    const gradient = renderToStaticMarkup(
      renderEditorPresetPreview('sceneBackground', {
        ...defaults.sceneBackground.presets[0]!,
        settings: {
          ...defaults.sceneBackground.presets[0]!.settings,
          backgroundMode: 'gradient',
        },
      })
    );
    const border = renderToStaticMarkup(
      renderBorderPresetPreview({
        ...DEFAULT_BORDER_PRESET,
        color: '#123456',
        fillPaint: { color: '#abcdef', kind: 'solid' },
        width: 20,
      })
    );

    expect(alphabetic).toContain('A');
    expect(numericFallback).toContain('1');
    expect(gradient).toContain('linear-gradient');
    expect(border).toContain('border-width:3px');
  });

  it('clones current preset settings before comparison or persistence', () => {
    const settings = createDefaultEditorPresetStorageState().step.presets[0]!.settings;
    const comparable = sanitizeEditorComparableSettings('step', settings);
    const persisted = sanitizeEditorPresetSettings('step', settings);

    expect(comparable).toEqual(settings);
    expect(persisted).toEqual(settings);
    expect(comparable).not.toBe(settings);
    expect(persisted).not.toBe(settings);
  });
});
