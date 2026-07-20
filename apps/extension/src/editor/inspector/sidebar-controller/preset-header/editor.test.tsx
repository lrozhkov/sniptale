// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const previewMock = vi.hoisted(() => vi.fn(() => <span data-testid="preview" />));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../../../features/editor/presets/display', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/editor/presets/display')>()),
  getEditorPresetDisplayName: (preset: { isSystemDefault?: boolean; name: string }) =>
    preset.isSystemDefault ? 'shared.defaults.defaultEditorPresetName' : preset.name,
}));

vi.mock('../../presets/preview', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../presets/preview')>()),
  renderEditorPresetPreview: previewMock,
}));

import { useEditorStoredPresetHeader } from './editor';

function createArrowSettings(width: number) {
  return {
    color: '#111111',
    width,
    opacity: 0.7,
    shadow: 20,
    mode: 'straight' as const,
    startHead: 'none' as const,
    endHead: 'triangle' as const,
    variant: 'standard' as const,
  };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useEditorStoredPresetHeader<'arrow'>> | null = null;

function Harness(props: { applySettings: (settings: unknown) => void; currentWidth: number }) {
  latestState = useEditorStoredPresetHeader({
    applySettings: props.applySettings as never,
    baseOwner: 'arrow',
    collection: {
      defaultPresetId: 'preset-1',
      presets: [
        {
          id: 'preset-1',
          name: 'Preset 1',
          order: 0,
          enabled: true,
          settings: createArrowSettings(4),
        },
        {
          id: 'preset-2',
          name: 'Preset 2',
          order: 1,
          enabled: true,
          settings: createArrowSettings(8),
        },
        {
          id: 'disabled',
          name: 'Disabled',
          order: 2,
          enabled: false,
          settings: createArrowSettings(12),
        },
      ],
    },
    currentSettings: createArrowSettings(props.currentWidth),
    family: 'arrow',
  });
  return null;
}

async function renderHarness(props: Parameters<typeof Harness>[0]) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<Harness {...props} />);
  });
}

function SystemHarness() {
  latestState = useEditorStoredPresetHeader({
    applySettings: vi.fn(),
    baseOwner: 'arrow',
    collection: {
      defaultPresetId: 'system-default',
      presets: [
        {
          id: 'system-default',
          name: 'shared.defaults.defaultBorderPresetName',
          order: 0,
          enabled: true,
          isSystemDefault: true,
          settings: createArrowSettings(4),
        },
      ],
    },
    currentSettings: createArrowSettings(4),
    family: 'arrow',
  });
  return null;
}

async function renderSystemHarness() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<SystemHarness />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  localStorage.clear();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  latestState = null;
  vi.unstubAllGlobals();
});

describe('useEditorStoredPresetHeader template state', () => {
  it('builds template cards with previews and selects matching current settings', async () => {
    await renderHarness({ applySettings: vi.fn(), currentWidth: 8 });

    expect(latestState?.activeView).toBe('parameters');
    expect(latestState?.saveDisabled).toBe(true);
    expect(latestState?.templates.map((template) => template.label)).toEqual([
      'Preset 1',
      'Preset 2',
    ]);
    expect(latestState?.groups?.map((group) => [group.id, group.templates.length])).toEqual([
      ['system', 0],
      ['user', 2],
    ]);
    expect(latestState?.templates.map((template) => template.selected)).toEqual([false, true]);
    expect(previewMock).toHaveBeenCalledTimes(2);
  });

  it('enables save when settings match no enabled template and applies cards without tab change', async () => {
    const applySettings = vi.fn();

    await renderHarness({ applySettings, currentWidth: 6 });
    await act(async () => {
      latestState?.onViewChange('templates');
    });
    await act(async () => {
      latestState?.templates[1]?.onApply();
    });

    expect(applySettings).toHaveBeenCalledWith(createArrowSettings(8));
    await renderHarness({ applySettings, currentWidth: 8 });
    expect(latestState?.templates.map((template) => template.selected)).toEqual([false, true]);
    expect(latestState?.saveDisabled).toBe(true);

    await renderHarness({ applySettings, currentWidth: 6 });
    expect(latestState?.activeView).toBe('templates');
  });
});

describe('useEditorStoredPresetHeader system labels', () => {
  it('projects the generic editor system label without changing stored entities', async () => {
    await renderSystemHarness();

    expect(latestState?.templates.map((template) => template.label)).toEqual([
      'shared.defaults.defaultEditorPresetName',
    ]);
    expect(latestState?.groups?.map((group) => [group.id, group.templates.length])).toEqual([
      ['system', 1],
      ['user', 0],
    ]);
  });
});
