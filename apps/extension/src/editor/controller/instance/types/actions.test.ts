import { describe, expect, it } from 'vitest';

import type {
  EditorControllerInstanceDocumentActions,
  EditorControllerInstanceLayerActions,
  EditorControllerInstanceLifecycleActions,
  EditorControllerInstanceObjectCapabilities,
  EditorControllerInstanceSceneActions,
  EditorControllerInstanceSelectionActions,
} from './actions';

type Assert<T extends true> = T;
type HasDocumentLifecycle = Assert<
  EditorControllerInstanceDocumentActions extends {
    closeDocument(): void;
    undo(): Promise<void>;
  }
    ? true
    : false
>;
type HasLayerAuthority = Assert<
  EditorControllerInstanceLayerActions extends {
    toggleLayerLock(id: string): void;
    mergeSelectedLayers(): Promise<void>;
  }
    ? true
    : false
>;
type HasLifecycleAuthority = Assert<
  EditorControllerInstanceLifecycleActions extends {
    mount(
      canvasElement: HTMLCanvasElement,
      viewportElement: HTMLElement,
      stageElement: HTMLElement
    ): void;
    dispose(): void;
  }
    ? true
    : false
>;
type HasObjectCapabilities = Assert<
  EditorControllerInstanceObjectCapabilities extends {
    ensureReachableObjects(): boolean;
    syncRuntimeState(): void;
  }
    ? true
    : false
>;
type HasSceneAuthority = Assert<
  EditorControllerInstanceSceneActions extends {
    resizeCanvas(width: number, height: number): void;
    zoomToFit(): void;
  }
    ? true
    : false
>;
type HasSelectionAuthority = Assert<
  EditorControllerInstanceSelectionActions extends {
    clearSelection(): void;
    duplicateSelection(): Promise<void>;
  }
    ? true
    : false
>;

describe('controller instance action type roles', () => {
  it.each([
    ['document lifecycle', true as HasDocumentLifecycle],
    ['layer mutations', true as HasLayerAuthority],
    ['controller lifecycle', true as HasLifecycleAuthority],
    ['object capabilities', true as HasObjectCapabilities],
    ['scene commands', true as HasSceneAuthority],
    ['selection commands', true as HasSelectionAuthority],
  ])('keeps %s in its named role', (_role, typeContract) => {
    expect(typeContract).toBe(true);
  });
});
