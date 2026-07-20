// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorShapeSettings } from '../../../../features/editor/document/types';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../../../features/editor/presets/display', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/editor/presets/display')>()),
  getEditorPresetDisplayName: (preset: { name: string }) => preset.name,
}));

vi.mock('../../presets/preview', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../presets/preview')>()),
  renderEditorPresetPreview: () => <span data-testid="preview" />,
}));

import { useEditorStoredPresetHeader } from './editor';

function createEllipseSettings(strokeColor: string, strokeStyle: 'solid' | 'dashed') {
  return {
    borderPresetId: 'border-1',
    customCss: 'outline: 1px solid red;',
    fillColor: '#00000000',
    fillOpacity: 0,
    inheritCustomCss: true,
    opacity: 0.4,
    radius: 8,
    shadow: 30,
    strokeColor,
    strokeOpacity: 0.7,
    strokeStyle,
    strokeWidth: 4,
  };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useEditorStoredPresetHeader<'ellipse'>> | null = null;

function Harness(props: { applySettings: (settings: EditorShapeSettings) => void }) {
  latestState = useEditorStoredPresetHeader({
    applySettings: props.applySettings,
    baseOwner: 'ellipse',
    collection: {
      defaultPresetId: 'preset-1',
      presets: [
        {
          id: 'preset-1',
          name: 'Preset 1',
          order: 0,
          enabled: true,
          settings: createEllipseSettings('#111111', 'solid'),
        },
        {
          id: 'preset-2',
          name: 'Preset 2',
          order: 1,
          enabled: true,
          settings: createEllipseSettings('#abcdef', 'dashed'),
        },
      ],
    },
    currentSettings: {
      ...createEllipseSettings('#111111', 'solid'),
      radius: 22,
    },
    family: 'ellipse',
  });
  return null;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  latestState = null;
  vi.unstubAllGlobals();
});

describe('useEditorStoredPresetHeader ellipse sanitize path', () => {
  it('sanitizes ellipse template settings before matching and apply', async () => {
    const applySettings = vi.fn<(settings: EditorShapeSettings) => void>();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<Harness applySettings={applySettings} />);
    });

    expect(latestState?.templates.map((template) => template.selected)).toEqual([true, false]);

    latestState?.templates[1]?.onApply();

    expect(applySettings).toHaveBeenCalledWith(
      expect.objectContaining({
        customCss: '',
        fillColor: 'transparent',
        fillOpacity: 0,
        inheritCustomCss: false,
        opacity: 0.7,
        radius: 0,
        strokeColor: '#abcdef',
        strokeStyle: 'dashed',
      })
    );
  });
});
