// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../features/editor/document/public', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/editor/document/public')>()),
  projectBorderPresetToEditorShapeSettings: (preset: { color: string; id: string }) => ({
    borderPresetId: preset.id,
    customCss: '',
    fillColor: '#00000000',
    fillOpacity: 0,
    inheritCustomCss: false,
    opacity: 1,
    radius: 0,
    shadow: 0,
    strokeColor: preset.color,
    strokeOpacity: 1,
    strokeStyle: 'solid',
    strokeWidth: 4,
  }),
}));

vi.mock('../../../../features/editor/presets/display', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/editor/presets/display')>()),
  getEditorPresetDisplayName: (preset: { name: string }) => preset.name,
}));

vi.mock('../../presets/preview', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../presets/preview')>()),
  renderBorderPresetPreview: () => <span data-testid="preview" />,
}));

import { useBorderPresetHeader } from './border';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useBorderPresetHeader> | null = null;

function createBorderPreset() {
  return {
    id: 'border-1',
    name: 'Border 1',
    order: 0,
    enabled: true,
    color: '#111111',
    width: 4,
    style: 'solid' as const,
    radius: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    shadow: 0,
    opacity: 100,
    strokeOpacity: 100,
    fillColor: '#ffffff',
    fillOpacity: 0,
    inheritCustomCss: false,
    customCss: '',
  };
}

function ComparableHarness() {
  latestState = useBorderPresetHeader({
    applySettings: vi.fn(),
    borderPresets: [createBorderPreset()] as never,
    currentSettings: {
      borderPresetId: 'border-1',
      customCss: 'outline: 1px solid red;',
      fillColor: '#000000',
      fillOpacity: 0,
      inheritCustomCss: true,
      opacity: 0.4,
      radius: 0,
      shadow: 0,
      strokeColor: '#111111',
      strokeOpacity: 1,
      strokeStyle: 'solid',
      strokeWidth: 4,
    } as never,
    defaultBorderPresetId: 'border-1',
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

describe('useBorderPresetHeader comparable settings', () => {
  it('sanitizes rectangle comparable settings before matching templates', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<ComparableHarness />);
    });

    expect(latestState?.saveDisabled).toBe(true);
    expect(latestState?.templates[0]?.selected).toBe(true);
  });
});
