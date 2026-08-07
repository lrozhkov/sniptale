// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createCrudActionsSpy, createDragActionsSpy, createSettingsActionsSpy, useSectionStateSpy } =
  vi.hoisted(() => ({
    createCrudActionsSpy: vi.fn(),
    createDragActionsSpy: vi.fn(),
    createSettingsActionsSpy: vi.fn(),
    useSectionStateSpy: vi.fn(),
  }));

vi.mock('./crud-actions', () => ({
  createHighlighterCrudActions: (state: unknown) => createCrudActionsSpy(state),
}));

vi.mock('./drag-actions', () => ({
  createHighlighterDragActions: (state: unknown) => createDragActionsSpy(state),
}));

vi.mock('./persistence-actions', () => ({
  createHighlighterSettingsActions: (state: unknown) => createSettingsActionsSpy(state),
}));

vi.mock('./state', () => ({
  useHighlighterSectionState: () => useSectionStateSpy(),
}));

import { useHighlighterSection } from './useHighlighterSection';

let container: HTMLDivElement | null = null;
let latestState: ReturnType<typeof useHighlighterSection> | null = null;
let root: Root | null = null;

function HighlighterSectionHarness() {
  latestState = useHighlighterSection();
  return null;
}

async function renderHarness() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<HighlighterSectionHarness />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  createCrudActionsSpy.mockReset();
  createDragActionsSpy.mockReset();
  createSettingsActionsSpy.mockReset();
  useSectionStateSpy.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  latestState = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('useHighlighterSection', () => {
  it('keeps persistence private and composes disposable UI state with narrow action owners', async () => {
    const persistenceState = {
      isLoading: false,
      settings: { enabled: true },
      settingsPersistenceSession: {},
      setSettings: vi.fn(),
    };
    const crudActions = {
      handleAddPreset: vi.fn(),
      handleCloseEditor: vi.fn(),
    };
    const dragActions = {
      handleDragEnd: vi.fn(),
    };
    const settingsActions = {
      handleSetDefaultPreset: vi.fn(),
      handleTogglePresetEnabled: vi.fn(),
      handleUpdateBlurSettings: vi.fn(),
      handleUpdateFocusSettings: vi.fn(),
    };

    useSectionStateSpy.mockReturnValue(persistenceState);
    createCrudActionsSpy.mockReturnValue(crudActions);
    createDragActionsSpy.mockReturnValue(dragActions);
    createSettingsActionsSpy.mockReturnValue(settingsActions);

    await renderHarness();

    expect(createCrudActionsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        ...persistenceState,
        setEditingPreset: expect.any(Function),
        setIsEditorOpen: expect.any(Function),
      })
    );
    expect(createDragActionsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        ...persistenceState,
        draggedId: null,
        setDraggedId: expect.any(Function),
        setDragOverId: expect.any(Function),
      })
    );
    expect(createSettingsActionsSpy).toHaveBeenCalledWith(persistenceState);
    expect(latestState).toEqual(
      expect.objectContaining({
        effects: {
          handleUpdateBlurSettings: settingsActions.handleUpdateBlurSettings,
          handleUpdateFocusSettings: settingsActions.handleUpdateFocusSettings,
        },
        presets: expect.objectContaining({
          ...crudActions,
          ...dragActions,
          draggedId: null,
          dragOverId: null,
          editingPreset: undefined,
          hoveredPresetId: null,
          isEditorOpen: false,
          handleSetDefaultPreset: settingsActions.handleSetDefaultPreset,
          handleTogglePresetEnabled: settingsActions.handleTogglePresetEnabled,
          handlePresetHoverChange: expect.any(Function),
        }),
        status: {
          isLoading: false,
          settings: persistenceState.settings,
        },
      })
    );
    expect(latestState).not.toHaveProperty('settingsPersistenceSession');
    expect(latestState?.presets).not.toHaveProperty('setSettings');
    expect(latestState?.presets).not.toHaveProperty('setDraggedId');
    expect(latestState?.presets).not.toHaveProperty('setEditingPreset');

    await act(async () => {
      latestState?.presets.handlePresetHoverChange('preset-1');
    });

    expect(latestState?.presets.hoveredPresetId).toBe('preset-1');
  });
});
