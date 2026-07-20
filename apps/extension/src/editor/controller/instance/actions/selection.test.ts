/* eslint-disable max-lines-per-function -- selection action coverage keeps public api routing together */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyEditorControllerLayerEffectMock: vi.fn(),
  applyEditorControllerLayerTransformationMock: vi.fn(),
  applyEditorSelectionSettingsViaControllerMock: vi.fn(),
  previewEditorSelectionSettingsViaControllerMock: vi.fn(),
  applyEditorTextSelectionStyleMock: vi.fn(() => true),
  deleteEditorControllerSelectionMock: vi.fn(),
  duplicateEditorControllerSelectionMock: vi.fn(),
  nudgeEditorControllerSelectionMock: vi.fn(() => true),
  insertEditorControllerImageMock: vi.fn(),
  insertEditorControllerTechnicalDataMock: vi.fn(),
  mergeEditorControllerSelectedLayersMock: vi.fn(),
  previewEditorControllerLayerEffectMock: vi.fn(),
  removeEditorControllerLayerEffectMock: vi.fn(),
  redoEditorControllerSnapshotMock: vi.fn(),
  renameEditorControllerLayerMock: vi.fn(),
  reorderEditorControllerLayerMock: vi.fn(),
  resetEditorControllerToOriginalMock: vi.fn(),
  resizeEditorControllerLayerMock: vi.fn(),
  resetEditorControllerLayerEffectPreviewMock: vi.fn(),
  selectEditorControllerLayerMock: vi.fn(),
  toggleEditorControllerLayerLockMock: vi.fn(),
  toggleEditorControllerLayerVisibilityMock: vi.fn(),
  undoEditorControllerSnapshotMock: vi.fn(),
  updateEditorControllerLayerEffectMock: vi.fn(),
}));

vi.mock('../../public-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../public-api')>()),
  applyEditorSelectionSettingsViaController: mocks.applyEditorSelectionSettingsViaControllerMock,
  previewEditorSelectionSettingsViaController:
    mocks.previewEditorSelectionSettingsViaControllerMock,
  deleteEditorControllerSelection: mocks.deleteEditorControllerSelectionMock,
  duplicateEditorControllerSelection: mocks.duplicateEditorControllerSelectionMock,
  nudgeEditorControllerSelection: mocks.nudgeEditorControllerSelectionMock,
  insertEditorControllerImage: mocks.insertEditorControllerImageMock,
  insertEditorControllerTechnicalData: mocks.insertEditorControllerTechnicalDataMock,
  redoEditorControllerSnapshot: mocks.redoEditorControllerSnapshotMock,
  resetEditorControllerToOriginal: mocks.resetEditorControllerToOriginalMock,
  undoEditorControllerSnapshot: mocks.undoEditorControllerSnapshotMock,
}));

vi.mock('../../public-api/layer-selection-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../public-api/layer-selection-actions')>()),
  reorderEditorControllerLayer: mocks.reorderEditorControllerLayerMock,
  selectEditorControllerLayer: mocks.selectEditorControllerLayerMock,
}));

vi.mock('../../public-api/layer-metadata-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../public-api/layer-metadata-actions')>()),
  renameEditorControllerLayer: mocks.renameEditorControllerLayerMock,
  toggleEditorControllerLayerLock: mocks.toggleEditorControllerLayerLockMock,
  toggleEditorControllerLayerVisibility: mocks.toggleEditorControllerLayerVisibilityMock,
}));

vi.mock('../../public-api/layer-raster-actions/resize', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../public-api/layer-raster-actions/resize')>()),
  resizeEditorControllerLayer: mocks.resizeEditorControllerLayerMock,
}));

vi.mock('../../public-api/layer-raster-actions/merge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../public-api/layer-raster-actions/merge')>()),
  mergeEditorControllerSelectedLayers: mocks.mergeEditorControllerSelectedLayersMock,
}));

vi.mock('../../public-api/layer-raster-actions/effects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../public-api/layer-raster-actions/effects')>()),
  applyEditorControllerLayerEffect: mocks.applyEditorControllerLayerEffectMock,
  previewEditorControllerLayerEffect: mocks.previewEditorControllerLayerEffectMock,
  removeEditorControllerLayerEffect: mocks.removeEditorControllerLayerEffectMock,
  resetEditorControllerLayerEffectPreview: mocks.resetEditorControllerLayerEffectPreviewMock,
  updateEditorControllerLayerEffect: mocks.updateEditorControllerLayerEffectMock,
}));

vi.mock('../../public-api/layer-raster-actions/transform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../public-api/layer-raster-actions/transform')>()),
  applyEditorControllerLayerTransformation: mocks.applyEditorControllerLayerTransformationMock,
}));

vi.mock('../../text-formatting', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../text-formatting')>()),
  applyEditorTextSelectionStyle: mocks.applyEditorTextSelectionStyleMock,
}));

import {
  applyLayerEffectForController,
  applyLayerTransformationForController,
  applySelectionSettingsForController,
  applyTextSelectionStyleForController,
  deleteSelectionForController,
  duplicateSelectionForController,
  finalizeSelectionNudgeForController,
  insertImageForController,
  insertTechnicalDataForController,
  mergeSelectedLayersForController,
  nudgeSelectionForController,
  previewLayerEffectForController,
  removeLayerEffectForController,
  resetLayerEffectPreviewForController,
  redoForController,
  renameLayerForController,
  reorderLayerForController,
  resetToOriginalForController,
  resizeLayerForController,
  selectLayerForController,
  previewSelectionSettingsForController,
  toggleLayerLockForController,
  toggleLayerVisibilityForController,
  undoForController,
  updateLayerEffectForController,
} from './selection';

function createController() {
  return {
    getPublicApiAdapter: vi.fn(() => ({ id: 'adapter' })),
    commitHistory: vi.fn(),
    selectionNudgeSession: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.duplicateEditorControllerSelectionMock.mockResolvedValue(undefined);
  mocks.insertEditorControllerImageMock.mockResolvedValue(undefined);
  mocks.mergeEditorControllerSelectedLayersMock.mockResolvedValue(undefined);
  mocks.redoEditorControllerSnapshotMock.mockResolvedValue(undefined);
  mocks.resetEditorControllerToOriginalMock.mockResolvedValue(undefined);
  mocks.undoEditorControllerSnapshotMock.mockResolvedValue(undefined);
  mocks.applyEditorControllerLayerEffectMock.mockResolvedValue(undefined);
  mocks.applyEditorControllerLayerTransformationMock.mockResolvedValue(undefined);
  mocks.updateEditorControllerLayerEffectMock.mockResolvedValue(undefined);
});

function runEditorControllerInstanceSelectionHistorySuite() {
  it('routes history and selection actions through the public api adapter', async () => {
    const controller = createController();
    const typedController = controller as never;

    applySelectionSettingsForController(typedController);
    previewSelectionSettingsForController(typedController);
    applyTextSelectionStyleForController(typedController, 'bold');
    await undoForController(typedController);
    await redoForController(typedController);
    await resetToOriginalForController(typedController);
    deleteSelectionForController(typedController);
    await duplicateSelectionForController(typedController);
    expect(
      nudgeSelectionForController(typedController, {
        code: 'ArrowRight',
        deltaX: 1,
        deltaY: 0,
        step: 1,
      })
    ).toBe(true);
    finalizeSelectionNudgeForController(typedController, 'ArrowRight');

    expect(mocks.applyEditorSelectionSettingsViaControllerMock).toHaveBeenCalledWith({
      id: 'adapter',
    });
    expect(mocks.previewEditorSelectionSettingsViaControllerMock).toHaveBeenCalledWith({
      id: 'adapter',
    });
    expect(mocks.applyEditorTextSelectionStyleMock).toHaveBeenCalledWith({ id: 'adapter' }, 'bold');
    expect(mocks.undoEditorControllerSnapshotMock).toHaveBeenCalledWith({ id: 'adapter' });
    expect(mocks.redoEditorControllerSnapshotMock).toHaveBeenCalledWith({ id: 'adapter' });
    expect(mocks.resetEditorControllerToOriginalMock).toHaveBeenCalledWith({ id: 'adapter' });
    expect(mocks.deleteEditorControllerSelectionMock).toHaveBeenCalledWith({ id: 'adapter' });
    expect(mocks.duplicateEditorControllerSelectionMock).toHaveBeenCalledWith({ id: 'adapter' });
    expect(mocks.nudgeEditorControllerSelectionMock).toHaveBeenCalledWith(
      { id: 'adapter' },
      {
        code: 'ArrowRight',
        deltaX: 1,
        deltaY: 0,
        step: 1,
      }
    );
    expect(controller.commitHistory).toHaveBeenCalledOnce();
  });
}

function runEditorControllerInstanceSelectionLayerSuite() {
  it('routes layer and insertion actions through the public api adapter', async () => {
    const controller = createController();
    const typedController = controller as never;

    reorderLayerForController(typedController, 'dragged', 'target');
    selectLayerForController(typedController, 'layer-1', { toggle: true });
    renameLayerForController(typedController, 'layer-1', 'Renamed');
    toggleLayerVisibilityForController(typedController, 'layer-1');
    toggleLayerLockForController(typedController, 'layer-1');
    resizeLayerForController(typedController, 'layer-1', 120, 80);
    await mergeSelectedLayersForController(typedController);
    await applyLayerEffectForController(typedController, 'layer-1', {
      amount: 0.4,
      enabled: true,
      id: 'brightness',
    });
    await updateLayerEffectForController(typedController, 'layer-1', {
      amount: 0.4,
      enabled: true,
      id: 'brightness',
    });
    previewLayerEffectForController(typedController, 'layer-1', {
      amount: 0.2,
      enabled: true,
      id: 'contrast',
    });
    resetLayerEffectPreviewForController(typedController, 'layer-1');
    removeLayerEffectForController(typedController, 'layer-1', 'brightness');
    await applyLayerTransformationForController(typedController, 'layer-1', 'rotate-right');
    await insertImageForController(typedController, 'data:image/png;base64:image', 'image.png');
    insertTechnicalDataForController(typedController, ['browser', 'url']);

    expect(mocks.reorderEditorControllerLayerMock).toHaveBeenCalledWith(
      { id: 'adapter' },
      'dragged',
      'target'
    );
    expect(mocks.selectEditorControllerLayerMock).toHaveBeenCalledWith(
      { id: 'adapter' },
      'layer-1',
      { toggle: true }
    );
    expect(mocks.renameEditorControllerLayerMock).toHaveBeenCalledWith(
      { id: 'adapter' },
      'layer-1',
      'Renamed'
    );
    expect(mocks.toggleEditorControllerLayerVisibilityMock).toHaveBeenCalledWith(
      { id: 'adapter' },
      'layer-1'
    );
    expect(mocks.toggleEditorControllerLayerLockMock).toHaveBeenCalledWith(
      { id: 'adapter' },
      'layer-1'
    );
    expect(mocks.resizeEditorControllerLayerMock).toHaveBeenCalledWith(
      { id: 'adapter' },
      'layer-1',
      120,
      80
    );
    expect(mocks.mergeEditorControllerSelectedLayersMock).toHaveBeenCalledWith({ id: 'adapter' });
    expect(mocks.applyEditorControllerLayerEffectMock).toHaveBeenCalledWith(
      { id: 'adapter' },
      'layer-1',
      { amount: 0.4, enabled: true, id: 'brightness' }
    );
    expect(mocks.updateEditorControllerLayerEffectMock).toHaveBeenCalledWith(
      { id: 'adapter' },
      'layer-1',
      { amount: 0.4, enabled: true, id: 'brightness' }
    );
    expect(mocks.previewEditorControllerLayerEffectMock).toHaveBeenCalledWith(
      { id: 'adapter' },
      'layer-1',
      { amount: 0.2, enabled: true, id: 'contrast' }
    );
    expect(mocks.resetEditorControllerLayerEffectPreviewMock).toHaveBeenCalledWith(
      { id: 'adapter' },
      'layer-1'
    );
    expect(mocks.removeEditorControllerLayerEffectMock).toHaveBeenCalledWith(
      { id: 'adapter' },
      'layer-1',
      'brightness'
    );
    expect(mocks.applyEditorControllerLayerTransformationMock).toHaveBeenCalledWith(
      { id: 'adapter' },
      'layer-1',
      'rotate-right'
    );
    expect(mocks.insertEditorControllerImageMock).toHaveBeenCalledWith(
      { id: 'adapter' },
      'data:image/png;base64:image',
      'image.png'
    );
    expect(mocks.insertEditorControllerTechnicalDataMock).toHaveBeenCalledWith(
      { id: 'adapter' },
      ['browser', 'url'],
      'column'
    );
  });
}

describe(
  'editor-controller-instance-selection-actions history',
  runEditorControllerInstanceSelectionHistorySuite
);
describe(
  'editor-controller-instance-selection-actions layers',
  runEditorControllerInstanceSelectionLayerSuite
);
