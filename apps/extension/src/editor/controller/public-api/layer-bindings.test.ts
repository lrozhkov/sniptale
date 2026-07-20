import { describe, expect, it, vi } from 'vitest';
import type { FabricObject } from 'fabric';

import type { SourceState } from '../../document/model/source-state';
import {
  type LayerHistoryBindingController,
  type LayerMutationBindingController,
  type LayerPreparedSourceBindingController,
  type LayerReachableSourceBindingController,
  type LayerSelectionBindingController,
  type LayerSourceBindingController,
  createLayerHistoryBindings,
  createLayerMutationBindings,
  createLayerPreparedSourceBindings,
  createLayerReachableSourceBindings,
  createLayerSelectionBindings,
  createLayerSourceBindings,
} from './layer-bindings';

function createSourceState(id: string): SourceState {
  return {
    dataUrl: 'data:image/png;base64,source',
    displayHeight: 90,
    displayWidth: 160,
    id,
    intrinsicHeight: 90,
    intrinsicWidth: 160,
    left: 0,
    locked: false,
    name: `${id}.png`,
    top: 0,
    visible: true,
  };
}

function createLayerObject(id: string): FabricObject {
  return { sniptaleId: id } as FabricObject;
}

function createHistoryController(): LayerHistoryBindingController {
  return {
    commitHistory: vi.fn(),
    syncRuntimeState: vi.fn(),
  };
}

function createSelectionController(): LayerSelectionBindingController {
  return {
    ...createHistoryController(),
    ensureObjectReachable: vi.fn(),
    focusObjectInViewport: vi.fn(),
  };
}

function createSourceController(): LayerSourceBindingController {
  return {
    ...createHistoryController(),
    setSource: vi.fn(),
  };
}

function createReachableSourceController(): LayerReachableSourceBindingController {
  return {
    ensureObjectReachable: vi.fn(),
    setSource: vi.fn(),
    syncRuntimeState: vi.fn(),
  };
}

function createPreparedSourceController(): LayerPreparedSourceBindingController {
  return {
    ...createSourceController(),
    prepareObject: vi.fn(),
  };
}

function createMutationController(): LayerMutationBindingController {
  return {
    ...createPreparedSourceController(),
    createLayerMutationToken: vi.fn(() => 7),
    isLayerMutationTokenCurrent: vi.fn(() => true),
    sendFrameObjectsToBack: vi.fn(),
  };
}

function registerHistoryBindingTest() {
  it('proxies history callbacks through the history slice', () => {
    const controller = createHistoryController();

    const historyBindings = createLayerHistoryBindings(controller);
    historyBindings.commitHistory();
    historyBindings.syncRuntimeState();

    expect(controller.commitHistory).toHaveBeenCalledOnce();
    expect(controller.syncRuntimeState).toHaveBeenCalledOnce();
  });
}

function registerSelectionBindingTest() {
  it('proxies selection callbacks through the selection slice', () => {
    const controller = createSelectionController();
    const layer = createLayerObject('layer-1');

    const selectionBindings = createLayerSelectionBindings(controller);
    selectionBindings.commitHistory();
    selectionBindings.syncRuntimeState();
    selectionBindings.ensureObjectReachable(layer);
    selectionBindings.focusObjectInViewport(layer);

    expect(controller.commitHistory).toHaveBeenCalledOnce();
    expect(controller.syncRuntimeState).toHaveBeenCalledOnce();
    expect(controller.ensureObjectReachable).toHaveBeenCalledWith(layer);
    expect(controller.focusObjectInViewport).toHaveBeenCalledWith(layer);
  });
}

function registerSourceBindingTest() {
  it('proxies source callbacks through source-local slices', () => {
    const sourceController = createSourceController();
    const reachableController = createReachableSourceController();
    const preparedController = createPreparedSourceController();
    const source = createSourceState('next-source');
    const reachableSource = createSourceState('reachable-source');
    const reachableLayer = createLayerObject('reachable-layer');
    const preparedLayer = createLayerObject('prepared-layer');

    createLayerSourceBindings(sourceController).setSource(source);
    const reachableBindings = createLayerReachableSourceBindings(reachableController);
    reachableBindings.ensureObjectReachable(reachableLayer);
    reachableBindings.setSource(reachableSource);
    reachableBindings.syncRuntimeState();
    createLayerPreparedSourceBindings(preparedController).prepareObject(preparedLayer);

    expect(sourceController.setSource).toHaveBeenCalledWith(source);
    expect(reachableController.ensureObjectReachable).toHaveBeenCalledWith(reachableLayer);
    expect(reachableController.setSource).toHaveBeenCalledWith(reachableSource);
    expect(reachableController.syncRuntimeState).toHaveBeenCalledOnce();
    expect(preparedController.prepareObject).toHaveBeenCalledWith(preparedLayer);
  });
}

function registerMutationBindingTest() {
  it('proxies mutation callbacks through the mutation slice', () => {
    const controller = createMutationController();
    const mutationBindings = createLayerMutationBindings(controller);

    mutationBindings.sendFrameObjectsToBack();

    expect(mutationBindings.createLayerMutationToken()).toBe(7);
    expect(mutationBindings.isLayerMutationTokenCurrent(7)).toBe(true);
    expect(controller.sendFrameObjectsToBack).toHaveBeenCalledOnce();
  });
}

function runLayerBindingsSuite() {
  registerHistoryBindingTest();
  registerSelectionBindingTest();
  registerSourceBindingTest();
  registerMutationBindingTest();
}

describe('editor-controller public api layer bindings', runLayerBindingsSuite);
