import type { MutableRefObject } from 'react';
import type { Root } from 'react-dom/client';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { EffectMode, FrameData, FrameState } from '../../../../features/highlighter/contracts';
import type { InteractiveFrameComponent } from './component';
import { getSortedFramesWithZIndex } from '../manager/layering';
import { createInteractiveFrameElement, type FrameRootActionRefs } from './element';
import type { AnchorPresentation } from '../host-layout/service';

const logger = createLogger({ namespace: 'ContentFrameRootsRenderer' });

export function renderInteractiveFrames({
  container,
  InteractiveFrameComponent,
  currentFrames,
  currentFrameStates,
  rootsRef,
  actionRefs,
  globalEffectModeRef,
  presentations,
}: {
  container: HTMLDivElement;
  InteractiveFrameComponent: InteractiveFrameComponent;
  currentFrames: FrameData[];
  currentFrameStates: Map<string, FrameState>;
  rootsRef: MutableRefObject<Map<string, Root>>;
  actionRefs: FrameRootActionRefs;
  globalEffectModeRef: MutableRefObject<EffectMode>;
  presentations: ReadonlyMap<string, AnchorPresentation>;
}) {
  if (!container.isConnected) {
    return;
  }

  const framesWithZIndex = getSortedFramesWithZIndex(currentFrames, currentFrameStates);
  framesWithZIndex.forEach((frameWithZIndex) => {
    if (!container.isConnected) {
      return;
    }

    const { zIndex, ...frameData } = frameWithZIndex;
    const root = rootsRef.current.get(frameData.id);
    if (!root) {
      return;
    }

    const frameContainer = Array.from(container.children).find(
      (child): child is HTMLElement => child.id === `frame-container-${frameData.id}`
    );
    const renderable = (presentations.get(frameData.id) ?? 'visible') === 'visible';
    if (!renderable) {
      try {
        root.unmount();
      } catch (error) {
        logger.error('Error unmounting unavailable frame root', error);
      } finally {
        rootsRef.current.delete(frameData.id);
        frameContainer?.remove();
      }
      return;
    }

    root.render(
      createInteractiveFrameElement({
        actionRefs,
        frameData,
        globalEffectModeRef,
        InteractiveFrameComponent,
        zIndex,
      })
    );
  });
}
