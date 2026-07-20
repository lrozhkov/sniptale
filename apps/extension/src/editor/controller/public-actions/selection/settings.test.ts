import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applySelectionToolSettingsToObjectsMock: vi.fn(),
  getSingleSelectionTypeMock: vi.fn(() => 'rectangle'),
  isEditableObjectMock: vi.fn(() => true),
}));

vi.mock('../../../state/useEditorStore', () => ({
  useEditorStore: {
    getState: () => ({
      selectionToolSettings: { shape: { strokeColor: '#000' } },
    }),
  },
}));
vi.mock('../../../document/model', async () => {
  const actual =
    await vi.importActual<typeof import('../../../document/model')>('../../../document/model');
  return {
    ...actual,
    getSingleSelectionType: mocks.getSingleSelectionTypeMock,
    isEditableObject: mocks.isEditableObjectMock,
  };
});
vi.mock('../../selection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../selection')>()),
  applySelectionToolSettingsToObjects: mocks.applySelectionToolSettingsToObjectsMock,
}));

import { applyEditorSelectionSettings, deleteEditorSelection } from './objects';

function registerSelectionSettingsTests() {
  it('applies selection settings only for matching editable objects', () => {
    const renderAll = vi.fn();
    const canvas = { getActiveObjects: () => [{ id: 'rect-1' }], requestRenderAll: renderAll };
    const commitHistory = vi.fn();
    const syncRuntimeState = vi.fn();
    const withHistoryMuted = ((callback: () => void) => callback()) as <T>(callback: () => T) => T;

    applyEditorSelectionSettings({
      canvas: canvas as never,
      commitHistory,
      syncRuntimeState,
      withHistoryMuted,
    });
    expect(mocks.applySelectionToolSettingsToObjectsMock).toHaveBeenCalled();
    expect(renderAll).toHaveBeenCalledOnce();
    expect(commitHistory).toHaveBeenCalledOnce();

    mocks.getSingleSelectionTypeMock.mockReturnValue(undefined as never);
    applyEditorSelectionSettings({
      canvas: canvas as never,
      commitHistory,
      syncRuntimeState,
      withHistoryMuted,
    });
    expect(mocks.applySelectionToolSettingsToObjectsMock).toHaveBeenCalledTimes(1);
  });

  it('does not apply selection settings to locked objects', () => {
    const canvas = {
      getActiveObjects: () => [{ id: 'rect-1', sniptaleLocked: true }],
      requestRenderAll: vi.fn(),
    };
    const commitHistory = vi.fn();
    const syncRuntimeState = vi.fn();
    const withHistoryMuted = vi.fn((callback: () => void) => callback()) as never;

    applyEditorSelectionSettings({
      canvas: canvas as never,
      commitHistory,
      syncRuntimeState,
      withHistoryMuted,
    });

    expect(mocks.applySelectionToolSettingsToObjectsMock).not.toHaveBeenCalled();
    expect(withHistoryMuted).not.toHaveBeenCalled();
    expect(commitHistory).not.toHaveBeenCalled();
    expect(syncRuntimeState).not.toHaveBeenCalled();
  });
}

function registerDeleteSelectionTests() {
  it('deletes editable non-source objects', () => {
    const removable = { id: 'one', role: 'annotation' };
    const canvas = {
      discardActiveObject: vi.fn(),
      getActiveObjects: () => [removable],
      remove: vi.fn(),
      requestRenderAll: vi.fn(),
    };

    deleteEditorSelection({
      canvas: canvas as never,
      commitHistory: vi.fn(),
      syncRuntimeState: vi.fn(),
    });

    expect(canvas.remove).toHaveBeenCalledWith(removable);
    expect(canvas.discardActiveObject).toHaveBeenCalledOnce();
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });

  it('does not delete a selection containing locked objects', () => {
    const locked = { id: 'one', sniptaleLocked: true, role: 'annotation' };
    const canvas = {
      discardActiveObject: vi.fn(),
      getActiveObjects: () => [locked],
      remove: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    const commitHistory = vi.fn();
    const syncRuntimeState = vi.fn();

    deleteEditorSelection({
      canvas: canvas as never,
      commitHistory,
      syncRuntimeState,
    });

    expect(canvas.remove).not.toHaveBeenCalled();
    expect(commitHistory).not.toHaveBeenCalled();
    expect(syncRuntimeState).not.toHaveBeenCalled();
  });
}

function runSelectionSettingsSuite() {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSingleSelectionTypeMock.mockReturnValue('rectangle');
  });

  registerSelectionSettingsTests();
  registerDeleteSelectionTests();
}

describe('editor-controller selection settings action', runSelectionSettingsSuite);
