/* eslint-disable max-lines-per-function */
import { describe, expect, it, vi } from 'vitest';

const fabricMock = vi.hoisted(() => ({
  ActiveSelection: class ActiveSelection {
    constructor(
      public objects: unknown[],
      public options: unknown
    ) {}
  },
  FabricImage: class FabricImage {},
}));

vi.mock('fabric', () => fabricMock);
const storeState = {
  selectionToolSettings: { shape: { fillColor: '#fff' } },
  updateFrame: vi.fn(),
};

const mocks = vi.hoisted(() => ({
  applySelectionToolSettingsMock: vi.fn(),
  createObjectLabelMock: vi.fn((type: string, index: number) => `${type}-${index}`),
  getSingleSelectionTypeMock: vi.fn(() => 'text'),
  isEditableObjectMock: vi.fn(() => true),
  isSourceObjectMock: vi.fn((_object?: unknown) => false),
  randomUuidMock: vi.fn(() => 'uuid-1'),
  storeGetStateMock: vi.fn(() => storeState),
  syncSourceStateFromObjectMock: vi.fn((source, object) =>
    object?.id === 'source'
      ? {
          ...source,
          syncedId: object.id,
        }
      : source
  ),
}));

vi.stubGlobal('crypto', { randomUUID: mocks.randomUuidMock });
vi.mock('../../../state/useEditorStore', () => ({
  EditorInspector: undefined,
  EditorState: undefined,
  useEditorStore: { getState: mocks.storeGetStateMock },
}));
vi.mock('../../../document/model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../document/model')>()),
  createObjectLabel: mocks.createObjectLabelMock,
  CUSTOM_JSON_PROPS: ['sniptaleId'],
  getSingleSelectionType: mocks.getSingleSelectionTypeMock,
  isEditableObject: mocks.isEditableObjectMock,
  isSourceObject: mocks.isSourceObjectMock,
}));
vi.mock('../../selection', () => ({
  applySelectionToolSettingsToObjects: mocks.applySelectionToolSettingsMock,
  syncSelectionToolSettingsFromObject: vi.fn(),
}));
vi.mock('../../document/source', () => ({
  ensureEditorSourceLayer: vi.fn(),
  syncSourceStateFromObject: mocks.syncSourceStateFromObjectMock,
}));
import {
  applyEditorSelectionSettings,
  deleteEditorSelection,
  duplicateEditorSelection,
  previewEditorSelectionSettings,
} from './objects';

function createCanvas(activeObjects: any[]) {
  return {
    add: vi.fn(),
    discardActiveObject: vi.fn(),
    getActiveObject: vi.fn(() => ({ setCoords: vi.fn() })),
    getActiveObjects: vi.fn(() => activeObjects),
    remove: vi.fn(),
    requestRenderAll: vi.fn(),
    setActiveObject: vi.fn(),
  } as any;
}

describe('selection object public actions', () => {
  it('applies selection settings only for typed editable selections', () => {
    const commitHistory = vi.fn();
    const syncRuntimeState = vi.fn();
    const withHistoryMuted = <T>(callback: () => T) => callback();

    applyEditorSelectionSettings({
      canvas: null,
      commitHistory,
      syncRuntimeState,
      withHistoryMuted,
    });
    applyEditorSelectionSettings({
      canvas: createCanvas([]),
      commitHistory,
      syncRuntimeState,
      withHistoryMuted,
    });
    expect(commitHistory).not.toHaveBeenCalled();
    mocks.getSingleSelectionTypeMock.mockReturnValueOnce(null as any);
    applyEditorSelectionSettings({
      canvas: createCanvas([{}]),
      commitHistory,
      syncRuntimeState,
      withHistoryMuted,
    });

    const selected = createCanvas([{}]);
    applyEditorSelectionSettings({
      canvas: selected,
      commitHistory,
      syncRuntimeState,
      withHistoryMuted,
    });

    expect(mocks.applySelectionToolSettingsMock).toHaveBeenCalled();
    expect(selected.requestRenderAll).toHaveBeenCalledOnce();
    expect(commitHistory).toHaveBeenCalledOnce();
    expect(syncRuntimeState).toHaveBeenCalledOnce();
    expect(commitHistory.mock.invocationCallOrder[0]!).toBeLessThan(
      syncRuntimeState.mock.invocationCallOrder[0]!
    );
  });
  it('previews selection settings without committing history', () => {
    const syncRuntimeState = vi.fn();
    const withHistoryMuted = <T>(callback: () => T) => callback();
    const selected = createCanvas([{}]);

    previewEditorSelectionSettings({
      canvas: selected,
      syncRuntimeState,
      withHistoryMuted,
    });

    expect(mocks.applySelectionToolSettingsMock).toHaveBeenCalled();
    expect(selected.requestRenderAll).toHaveBeenCalledOnce();
    expect(syncRuntimeState).toHaveBeenCalledOnce();
  });

  it('deletes selected editable objects but preserves source objects', () => {
    const editable = { id: 'editable' };
    const source = { id: 'source' };
    mocks.isSourceObjectMock.mockImplementation((object?: unknown) => object === source);
    const canvas = createCanvas([editable, source]);

    deleteEditorSelection({
      canvas,
      commitHistory: vi.fn(),
      syncRuntimeState: vi.fn(),
    });

    expect(canvas.remove).toHaveBeenCalledWith(editable);
    expect(canvas.remove).not.toHaveBeenCalledWith(source);
    expect(canvas.discardActiveObject).toHaveBeenCalledOnce();
  });

  it('resets frame background draft when deleting the managed background layer', () => {
    const background = { sniptaleRole: 'background', sniptaleType: 'background' };
    const canvas = createCanvas([background]);

    deleteEditorSelection({
      canvas,
      commitHistory: vi.fn(),
      syncRuntimeState: vi.fn(),
    });

    expect(canvas.remove).toHaveBeenCalledWith(background);
    expect(storeState.updateFrame).toHaveBeenCalledWith(
      expect.objectContaining({
        backgroundColor: 'transparent',
        backgroundGradientAngle: 145,
        backgroundGradientFrom: '#7c2d12',
        backgroundGradientStops: ['#7c2d12', '#f59e0b'],
        backgroundGradientTo: '#f59e0b',
        backgroundImageData: null,
        backgroundImageFit: 'cover',
        backgroundMode: 'gradient',
      })
    );
  });

  it('duplicates single and multiple selections and relabels cloned objects', async () => {
    const singleClone: any = { left: 0, sniptaleType: 'text', set: vi.fn() };
    const single = { clone: vi.fn(async () => singleClone), sniptaleType: 'text' };
    const singleCanvas = createCanvas([single]);

    await duplicateEditorSelection({
      canvas: singleCanvas,
      commitHistory: vi.fn(),
      nextLabelIndex: vi.fn(() => 2),
      prepareObject: vi.fn(),
      syncRuntimeState: vi.fn(),
    });

    expect(singleCanvas.setActiveObject).toHaveBeenCalledWith(singleClone);

    const sourceClone: any = { left: 1, sniptaleType: 'image', set: vi.fn() };
    const regularClone: any = { left: 2, sniptaleType: 'shape', set: vi.fn() };
    const source = { clone: vi.fn(async () => sourceClone), sniptaleType: 'image' };
    const regular = { clone: vi.fn(async () => regularClone), sniptaleType: 'shape' };
    mocks.isSourceObjectMock.mockImplementation((object?: unknown) => object === source);
    const multiCanvas = createCanvas([source, regular]);

    await duplicateEditorSelection({
      canvas: multiCanvas,
      commitHistory: vi.fn(),
      nextLabelIndex: vi.fn(() => 3),
      prepareObject: vi.fn(),
      syncRuntimeState: vi.fn(),
    });

    expect(multiCanvas.setActiveObject).toHaveBeenCalledWith(
      expect.any(fabricMock.ActiveSelection)
    );
    expect(sourceClone.sniptaleRole).toBe('annotation');
    expect(sourceClone.sniptaleType).toBe('image');
    expect(mocks.createObjectLabelMock).toHaveBeenCalled();
  });

  it('keeps duplicate selection inert when the canvas is missing or has no editable objects', async () => {
    await expect(
      duplicateEditorSelection({
        canvas: null,
        commitHistory: vi.fn(),
        nextLabelIndex: vi.fn(() => 1),
        prepareObject: vi.fn(),
        syncRuntimeState: vi.fn(),
      })
    ).resolves.toBeUndefined();

    await expect(
      duplicateEditorSelection({
        canvas: createCanvas([]),
        commitHistory: vi.fn(),
        nextLabelIndex: vi.fn(() => 1),
        prepareObject: vi.fn(),
        syncRuntimeState: vi.fn(),
      })
    ).resolves.toBeUndefined();
  });

  it('converts duplicated managed backgrounds into normal annotation layers', async () => {
    const clone: any = {
      left: 0,
      sniptaleRole: 'background',
      sniptaleType: 'background',
      set: vi.fn(),
    };
    const background = { clone: vi.fn(async () => clone), sniptaleType: 'background' };
    const canvas = createCanvas([background]);

    await duplicateEditorSelection({
      canvas,
      commitHistory: vi.fn(),
      nextLabelIndex: vi.fn(() => 4),
      prepareObject: vi.fn(),
      syncRuntimeState: vi.fn(),
    });

    expect(clone.sniptaleRole).toBe('annotation');
    expect(clone.sniptaleType).toBe('rectangle');
    expect(canvas.add).toHaveBeenCalledWith(clone);
  });
});
