import { expect, it, vi } from 'vitest';
import type { EditorSelectionState } from '../../../features/editor/document/types';
import { buildEditorInspectorSidebarControllerResult } from './result';

type SidebarControllerStoreResult = Parameters<
  typeof buildEditorInspectorSidebarControllerResult
>[0]['store'];

function createSelection(): EditorSelectionState {
  return {
    hasSelection: false,
    selectedObjectCount: 0,
    selectedObjectHeight: null,
    selectedObjectId: null,
    selectedObjectIds: [],
    selectedObjectType: null,
    selectedObjectWidth: null,
  };
}

function createStoreResult(): SidebarControllerStoreResult {
  return {
    activeTool: 'select',
    inspector: 'tool',
    inspectorCollapsed: false,
    layers: [],
    selection: createSelection(),
    setActiveTool: vi.fn(),
    setImageData: vi.fn(),
    setInspector: vi.fn(),
    setLayerEffectsCategory: vi.fn(),
    syncActiveTool: vi.fn(),
    updateWorkspace: vi.fn(),
  };
}

it('builds the sidebar result from named role contracts without leaking discarded store state', () => {
  const closeDocument = vi.fn();
  const result = buildEditorInspectorSidebarControllerResult({
    store: createStoreResult(),
    localState: { layersExpanded: true, openLayerEffects: vi.fn() },
    derived: { canvasSizeText: '800 x 600' },
    actions: { onOpenImage: vi.fn(), handleBackgroundImageUpload: vi.fn() },
    handleCloseDocument: closeDocument,
  });

  expect(result).toMatchObject({
    activeTool: 'select',
    canvasSizeText: '800 x 600',
    inspector: 'tool',
    inspectorCollapsed: false,
    layersExpanded: true,
    selection: createSelection(),
  });
  expect(result.handleCloseDocument).toBe(closeDocument);
  expect('viewport' in result).toBe(false);
  expect('workspace' in result).toBe(false);
});
