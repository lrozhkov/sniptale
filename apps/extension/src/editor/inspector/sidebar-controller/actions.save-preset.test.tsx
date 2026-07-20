// @vitest-environment jsdom

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_WORKSPACE_SETTINGS,
} from '../../../features/editor/document/constants';
import type { EditorShapeSettings } from '../../../features/editor/document/types';
import { DEFAULT_BORDER_PRESET } from '../../../features/highlighter/style/defaults';
import {
  createControllerMock,
  getEditorInspectorOwnershipMocks,
  renderWithControllerAsync,
} from '../../../../../../tooling/test/harness/editor/ownership/helpers';
import { createInspectorCommandParams } from '../../../../../../tooling/test/harness/editor/ownership/fixtures';

const { appendBorderPresetMock, rememberRecentColorMock } = vi.hoisted(() => ({
  appendBorderPresetMock: vi.fn(),
  rememberRecentColorMock: vi.fn(async () => undefined),
}));

vi.mock('./actions.state', () => ({
  useBorderPresetsState: () => ({
    appendBorderPreset: appendBorderPresetMock,
    borderPresets: [DEFAULT_BORDER_PRESET],
  }),
  useRecentColorsState: () => ({
    recentColors: [],
    rememberRecentColor: rememberRecentColorMock,
  }),
}));

type SavePresetActions = {
  saveShapeAsHighlighterPreset: () => Promise<void>;
};

function createSidebarActionArgs(overrides: Record<string, unknown> = {}) {
  return {
    activeTool: 'select',
    browserFrame: DEFAULT_BROWSER_FRAME_STATE,
    confirmOpenStorageManager: vi.fn(async () => false),
    defaultImagePresetId: 'preset-default',
    savePresets: createInspectorCommandParams().savePresets,
    selection: createInspectorCommandParams().selection,
    setBrowserFrame: vi.fn(),
    setFrameDraft: vi.fn(),
    shapeSettings: createInspectorCommandParams().inspectorToolSettings.rectangle,
    shapeTool: 'rectangle',
    textSettings: createInspectorCommandParams().inspectorToolSettings.text,
    updateArrowSettings: vi.fn(),
    updateBrushSettings: vi.fn(),
    updateSelectionArrowSettings: vi.fn(),
    updateSelectionBrushSettings: vi.fn(),
    updateSelectionShapeSettings: vi.fn(),
    updateSelectionStepSettings: vi.fn(),
    updateSelectionTextSettings: vi.fn(),
    updateShapeSettings: vi.fn(),
    updateStepSettings: vi.fn(),
    updateTextSettings: vi.fn(),
    workspace: DEFAULT_EDITOR_WORKSPACE_SETTINGS,
    ...overrides,
  } as never;
}

async function renderSavePresetActions(settingOverrides: Record<string, unknown>) {
  const { useEditorInspectorSidebarActions } = await import('./actions');
  const controller = createControllerMock();
  let actions: unknown = null;

  const Harness: React.FC = () => {
    actions = useEditorInspectorSidebarActions(createSidebarActionArgs(settingOverrides), false);
    return null;
  };

  await renderWithControllerAsync(<Harness />, controller);
  return actions as SavePresetActions;
}

function createShapeSettings(overrides: Partial<EditorShapeSettings> = {}): EditorShapeSettings {
  return {
    ...createInspectorCommandParams().inspectorToolSettings.rectangle,
    ...overrides,
  };
}

function expectSavedHighlighterPreset(updateSelectionShapeSettings: ReturnType<typeof vi.fn>) {
  const mocks = getEditorInspectorOwnershipMocks();

  expect(mocks.addBorderPresetMock).toHaveBeenCalledWith(
    expect.objectContaining({
      color: '#112233',
      customCss: '',
      fillColor: '#00ff00',
      fillOpacity: 25,
      id: 'preset-new',
      inheritCustomCss: false,
      opacity: 40,
      padding: DEFAULT_BORDER_PRESET.padding,
      strokeOpacity: 40,
    })
  );
  expect(appendBorderPresetMock).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'preset-new' })
  );
  expect(updateSelectionShapeSettings).toHaveBeenCalledWith('rectangle', {
    borderPresetId: 'preset-new',
  });
  expect(mocks.toastSuccessMock).toHaveBeenCalledOnce();
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('editor sidebar save shape as highlighter preset', () => {
  it('creates a new preset and points the shape to it after storage success', async () => {
    const randomUuidSpy = vi.spyOn(crypto, 'randomUUID');
    const updateSelectionShapeSettings = vi.fn();
    const updateShapeSettings = vi.fn();
    randomUuidSpy.mockReturnValue('preset-new' as ReturnType<typeof crypto.randomUUID>);

    try {
      const actions = await renderSavePresetActions({
        shapeSettings: createShapeSettings({
          borderPresetId: DEFAULT_BORDER_PRESET.id,
          customCss: 'outline: 1px solid red;',
          fillColor: '#00ff00',
          fillOpacity: 0.25,
          inheritCustomCss: true,
          strokeColor: '#112233',
          strokeOpacity: 0.4,
        }),
        updateSelectionShapeSettings,
        updateShapeSettings,
      });

      await actions.saveShapeAsHighlighterPreset();

      expectSavedHighlighterPreset(updateSelectionShapeSettings);
      expect(updateShapeSettings).not.toHaveBeenCalled();
    } finally {
      randomUuidSpy.mockRestore();
    }
  });

  it('does not mutate local editor state when storage rejects the new preset', async () => {
    const mocks = getEditorInspectorOwnershipMocks();
    const updateSelectionShapeSettings = vi.fn();
    mocks.addBorderPresetMock.mockRejectedValueOnce(new Error('storage failed'));

    const actions = await renderSavePresetActions({ updateSelectionShapeSettings });

    await actions.saveShapeAsHighlighterPreset();

    expect(appendBorderPresetMock).not.toHaveBeenCalled();
    expect(updateSelectionShapeSettings).not.toHaveBeenCalled();
    expect(mocks.toastErrorMock).toHaveBeenCalledOnce();
  });
});
