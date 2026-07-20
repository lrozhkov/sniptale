import { type FabricObject } from 'fabric';

import {
  applyGridSnapForController,
  buildViewportStateForController,
  ensureObjectReachableForController,
  ensureReachableObjectsForController,
  focusObjectInViewportForController,
  scheduleViewportStateSyncForController,
  scheduleZoomToFitForController,
  syncRuntimeStateForController,
  syncViewportStateForController,
} from '../instance/helpers';
import { ImageEditorControllerState } from './controller-state';

export abstract class ImageEditorControllerViewportHelperActions extends ImageEditorControllerState {
  applyGridSnap(object: FabricObject): void {
    applyGridSnapForController(this.instance, object);
  }

  buildViewportState() {
    return buildViewportStateForController(this.instance);
  }

  syncViewportState(): void {
    syncViewportStateForController(this.instance);
  }

  scheduleViewportStateSync(): void {
    scheduleViewportStateSyncForController(this.instance);
  }

  ensureObjectReachable(object: FabricObject): boolean {
    return ensureObjectReachableForController(this.instance, object);
  }

  ensureReachableObjects(): boolean {
    return ensureReachableObjectsForController(this.instance);
  }

  focusObjectInViewport(object: FabricObject): void {
    focusObjectInViewportForController(this.instance, object);
  }

  scheduleZoomToFit(): void {
    scheduleZoomToFitForController(this.instance);
  }

  syncRuntimeState(): void {
    syncRuntimeStateForController(this.instance);
  }
}
