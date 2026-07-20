// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const projectionMock = vi.hoisted(() =>
  vi.fn((preset) => ({
    borderPresetId: preset.id,
    customCss: '',
    fillColor: 'transparent',
    fillOpacity: 0,
    inheritCustomCss: false,
    opacity: preset.strokeOpacity,
    radius: 0,
    shadow: 0,
    strokeColor: preset.color,
    strokeWidth: preset.width,
    strokeStyle: preset.style,
    strokeOpacity: preset.strokeOpacity,
  }))
);
const previewMock = vi.hoisted(() => vi.fn(() => <span data-testid="preview" />));

vi.mock('../../../../features/editor/document/public', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/editor/document/public')>()),
  projectBorderPresetToEditorShapeSettings: projectionMock,
}));

vi.mock('../../../../features/editor/presets/display', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/editor/presets/display')>()),
  getEditorPresetDisplayName: (preset: { isSystemDefault?: boolean; name: string }) =>
    preset.isSystemDefault ? 'shared.defaults.defaultEditorPresetName' : preset.name,
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../presets/preview', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../presets/preview')>()),
  renderBorderPresetPreview: previewMock,
}));

import { useBorderPresetHeader } from './border';

function createBorderPreset(id: string, color: string, enabled = true, isSystemDefault = false) {
  return {
    id,
    name: id,
    order: id === 'border-1' ? 0 : 1,
    enabled,
    color,
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
    isSystemDefault,
  };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useBorderPresetHeader> | null = null;

function Harness(props: {
  applySettings: (settings: unknown) => void;
  strokeColor: string;
  systemFirst?: boolean;
}) {
  latestState = useBorderPresetHeader({
    applySettings: props.applySettings as never,
    borderPresets: [
      createBorderPreset('border-1', '#111111', true, props.systemFirst),
      createBorderPreset('border-2', '#222222'),
      createBorderPreset('disabled', props.strokeColor, false),
    ],
    currentSettings: {
      borderPresetId: null,
      customCss: '',
      fillColor: 'transparent',
      fillOpacity: 0,
      inheritCustomCss: false,
      opacity: 100,
      radius: 0,
      shadow: 0,
      strokeColor: props.strokeColor,
      strokeOpacity: 100,
      strokeStyle: 'solid',
      strokeWidth: 4,
    } as never,
    defaultBorderPresetId: 'border-1',
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

describe('useBorderPresetHeader', () => {
  it('builds border template cards and ignores disabled presets for matching', async () => {
    await renderHarness({ applySettings: vi.fn(), strokeColor: '#222222' });

    expect(latestState?.templates.map((template) => template.label)).toEqual([
      'border-1',
      'border-2',
    ]);
    expect(latestState?.groups?.map((group) => [group.id, group.templates.length])).toEqual([
      ['system', 0],
      ['user', 2],
    ]);
    expect(latestState?.templates.map((template) => template.selected)).toEqual([false, true]);
    expect(latestState?.saveDisabled).toBe(true);
    expect(previewMock).toHaveBeenCalledTimes(2);

    await renderHarness({ applySettings: vi.fn(), strokeColor: '#333333' });

    expect(latestState?.saveDisabled).toBe(false);
    expect(latestState?.templates.some((template) => template.id === 'disabled')).toBe(false);
  });

  it('groups system border templates separately from user templates', async () => {
    await renderHarness({ applySettings: vi.fn(), strokeColor: '#333333', systemFirst: true });

    expect(latestState?.groups?.map((group) => [group.id, group.templates.length])).toEqual([
      ['system', 1],
      ['user', 1],
    ]);
    expect(latestState?.templates[0]?.system).toBe(true);
  });
});

describe('useBorderPresetHeader apply actions', () => {
  it('applies selected border template settings', async () => {
    const applySettings = vi.fn();

    await renderHarness({ applySettings, strokeColor: '#333333' });
    await act(async () => {
      latestState?.templates[0]?.onApply();
    });

    expect(projectionMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'border-1' }));
    expect(applySettings).toHaveBeenCalledWith(
      expect.objectContaining({
        borderPresetId: 'border-1',
        strokeColor: '#111111',
      })
    );
    await renderHarness({ applySettings, strokeColor: '#111111' });
    expect(latestState?.templates.map((template) => template.selected)).toEqual([true, false]);
    expect(latestState?.saveDisabled).toBe(true);
  });
});
