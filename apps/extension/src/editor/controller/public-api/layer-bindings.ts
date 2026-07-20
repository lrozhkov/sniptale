import type { FabricObject } from 'fabric';

import type { SourceState } from '../../document/model/source-state';

export type LayerHistoryBindingController = {
  commitHistory: () => void;
  syncRuntimeState: () => void;
};

export type LayerSourceBindingController = LayerHistoryBindingController & {
  setSource: (source: SourceState | null) => void;
};

export type LayerReachableSourceBindingController = {
  ensureObjectReachable: (object: FabricObject) => boolean;
  setSource: (source: SourceState | null) => void;
  syncRuntimeState: () => void;
};

export type LayerPreparedSourceBindingController = LayerSourceBindingController & {
  prepareObject: (object: FabricObject) => void;
};

export type LayerSelectionBindingController = LayerHistoryBindingController & {
  ensureObjectReachable: (object: FabricObject) => boolean;
  focusObjectInViewport: (object: FabricObject) => void;
};

export type LayerMutationBindingController = LayerPreparedSourceBindingController & {
  sendFrameObjectsToBack: () => void;
  createLayerMutationToken: () => number;
  isLayerMutationTokenCurrent: (token: number) => boolean;
};

export function createLayerHistoryBindings(controller: LayerHistoryBindingController) {
  return {
    commitHistory: () => controller.commitHistory(),
    syncRuntimeState: () => controller.syncRuntimeState(),
  };
}

export function createLayerSelectionBindings(controller: LayerSelectionBindingController) {
  return {
    ...createLayerHistoryBindings(controller),
    ensureObjectReachable: (object: FabricObject) => controller.ensureObjectReachable(object),
    focusObjectInViewport: (object: FabricObject) => controller.focusObjectInViewport(object),
  };
}

export function createLayerSourceBindings(controller: LayerSourceBindingController) {
  return {
    ...createLayerHistoryBindings(controller),
    setSource: (source: SourceState | null) => controller.setSource(source),
  };
}

export function createLayerReachableSourceBindings(
  controller: LayerReachableSourceBindingController
) {
  return {
    ensureObjectReachable: (object: FabricObject) => controller.ensureObjectReachable(object),
    setSource: (source: SourceState | null) => controller.setSource(source),
    syncRuntimeState: () => controller.syncRuntimeState(),
  };
}

export function createLayerPreparedSourceBindings(
  controller: LayerPreparedSourceBindingController
) {
  return {
    ...createLayerSourceBindings(controller),
    prepareObject: (object: FabricObject) => controller.prepareObject(object),
  };
}

export function createLayerMutationBindings(controller: LayerMutationBindingController) {
  return {
    ...createLayerPreparedSourceBindings(controller),
    sendFrameObjectsToBack: () => controller.sendFrameObjectsToBack(),
    createLayerMutationToken: () => controller.createLayerMutationToken(),
    isLayerMutationTokenCurrent: (token: number) => controller.isLayerMutationTokenCurrent(token),
  };
}
