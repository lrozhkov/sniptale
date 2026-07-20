import { useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { Root } from 'react-dom/client';
import type { EffectMode, FrameData, FrameState } from '../../../../features/highlighter/contracts';
import type { InteractiveFrameComponent } from '../roots/component';
import type { FrameRenderDescriptor } from '../roots/descriptors';
import type { FrameRootActionRefs } from '../roots/element';
import { prepareFrameRootsRender } from '../roots/prepare';
import { renderPreparedFrameRoots } from '../roots/sync';

type UseFrameRootsRendererArgs = {
  containerRef: MutableRefObject<HTMLDivElement | null>;
  frames: FrameData[];
  framesRef: MutableRefObject<FrameData[]>;
  frameStatesRef: MutableRefObject<Map<string, FrameState>>;
  rootsRef: MutableRefObject<Map<string, Root>>;
  InteractiveFrameComponent: InteractiveFrameComponent;
  isClearingRef: MutableRefObject<boolean>;
  getOrCreateContainer: () => HTMLDivElement;
  globalEffectModeRef: MutableRefObject<EffectMode>;
  updateFrameState: (frameId: string, newState: FrameState) => void;
  updateFrame: (frameId: string, newFrame: FrameData) => void;
  removeFrame: (frameId: string) => void;
  updateFrameEffect: (frameId: string, mode: EffectMode) => void;
};

export function useFrameRootsRenderer({
  containerRef,
  frames,
  framesRef,
  frameStatesRef,
  rootsRef,
  InteractiveFrameComponent,
  isClearingRef,
  getOrCreateContainer,
  globalEffectModeRef,
  updateFrameState,
  updateFrame,
  removeFrame,
  updateFrameEffect,
}: UseFrameRootsRendererArgs): void {
  const prevRenderDescriptorsRef = useRef<FrameRenderDescriptor[]>([]);
  const currentFrameStates = frameStatesRef.current;
  const actionRefs = useFrameRootActionRefs({
    updateFrameState,
    updateFrame,
    removeFrame,
    updateFrameEffect,
  });

  useFrameRootsRenderEffect({
    actionRefs,
    currentFrameStates,
    frames,
    framesRef,
    globalEffectModeRef,
    InteractiveFrameComponent,
    getOrCreateContainer,
    isClearingRef,
    prevRenderDescriptorsRef,
    rootsRef,
  });
  useFrameRootsUnmountCleanup(containerRef, rootsRef);
}

function useFrameRootActionRefs({
  updateFrameState,
  updateFrame,
  removeFrame,
  updateFrameEffect,
}: Pick<
  UseFrameRootsRendererArgs,
  'updateFrameState' | 'updateFrame' | 'removeFrame' | 'updateFrameEffect'
>): FrameRootActionRefs {
  const updateFrameStateRef = useRef(updateFrameState);
  const updateFrameRef = useRef(updateFrame);
  const removeFrameRef = useRef(removeFrame);
  const updateFrameEffectRef = useRef(updateFrameEffect);

  updateFrameStateRef.current = updateFrameState;
  updateFrameRef.current = updateFrame;
  removeFrameRef.current = removeFrame;
  updateFrameEffectRef.current = updateFrameEffect;

  return useMemo(
    () => ({
      updateFrameEffectRef,
      updateFrameRef,
      updateFrameStateRef,
      removeFrameRef,
    }),
    []
  );
}

function useFrameRootsRenderEffect(args: {
  actionRefs: FrameRootActionRefs;
  currentFrameStates: Map<string, FrameState>;
  frames: FrameData[];
  framesRef: MutableRefObject<FrameData[]>;
  globalEffectModeRef: MutableRefObject<EffectMode>;
  InteractiveFrameComponent: InteractiveFrameComponent;
  getOrCreateContainer: () => HTMLDivElement;
  isClearingRef: MutableRefObject<boolean>;
  prevRenderDescriptorsRef: MutableRefObject<FrameRenderDescriptor[]>;
  rootsRef: MutableRefObject<Map<string, Root>>;
}) {
  useEffect(() => {
    const renderState = prepareFrameRootsRender({
      currentFrameStates: args.currentFrameStates,
      framesRef: args.framesRef,
      getOrCreateContainer: args.getOrCreateContainer,
      isClearingRef: args.isClearingRef,
      prevRenderDescriptorsRef: args.prevRenderDescriptorsRef,
      rootsRef: args.rootsRef,
    });
    if (!renderState) {
      return undefined;
    }

    return renderPreparedFrameRoots({
      actionRefs: args.actionRefs,
      globalEffectModeRef: args.globalEffectModeRef,
      InteractiveFrameComponent: args.InteractiveFrameComponent,
      renderState,
      rootsRef: args.rootsRef,
    });
  }, [
    args.actionRefs,
    args.currentFrameStates,
    args.frames,
    args.framesRef,
    args.getOrCreateContainer,
    args.globalEffectModeRef,
    args.InteractiveFrameComponent,
    args.isClearingRef,
    args.prevRenderDescriptorsRef,
    args.rootsRef,
  ]);
}

function useFrameRootsUnmountCleanup(
  containerRef: MutableRefObject<HTMLDivElement | null>,
  rootsRef: MutableRefObject<Map<string, Root>>
) {
  useEffect(() => {
    const roots = rootsRef.current;

    return () => {
      const container = containerRef.current;
      if (!container) {
        return;
      }

      roots.forEach((root) => {
        root.unmount();
      });
      roots.clear();

      container
        .querySelectorAll('[id^="frame-container-"]')
        .forEach((frameContainer) => frameContainer.remove());
      container.remove();
      containerRef.current = null;
    };
  }, [containerRef, rootsRef]);
}
