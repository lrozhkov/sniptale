import type { MutableRefObject } from 'react';
import type { Root } from 'react-dom/client';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { EffectMode, FrameData, FrameState } from '../../../../features/highlighter/contracts';
import type { InteractiveFrameComponent } from './component';
import { getFrameIframeDiagnostics } from '../diagnostics/iframe';
import { getSortedFramesWithZIndex } from '../manager/layering';
import { createInteractiveFrameElement, type FrameRootActionRefs } from './element';

const logger = createLogger({ namespace: 'ContentFrameIframeDiag' });

export function renderInteractiveFrames({
  cancelled,
  container,
  InteractiveFrameComponent,
  currentFrames,
  currentFrameStates,
  rootsRef,
  actionRefs,
  globalEffectModeRef,
}: {
  cancelled: boolean;
  container: HTMLDivElement;
  InteractiveFrameComponent: InteractiveFrameComponent;
  currentFrames: FrameData[];
  currentFrameStates: Map<string, FrameState>;
  rootsRef: MutableRefObject<Map<string, Root>>;
  actionRefs: FrameRootActionRefs;
  globalEffectModeRef: MutableRefObject<EffectMode>;
}) {
  if (cancelled || !container.isConnected) {
    return;
  }

  const framesWithZIndex = getSortedFramesWithZIndex(currentFrames, currentFrameStates);
  framesWithZIndex.forEach((frameWithZIndex) => {
    if (cancelled || !container.isConnected) {
      return;
    }

    const { zIndex, linkedElement, ...frameData } = frameWithZIndex;
    logIframeFrameRender(frameData, linkedElement);
    const root = rootsRef.current.get(frameData.id);
    if (!root) {
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

function logIframeFrameRender(frameData: FrameData, linkedElement?: HTMLElement): void {
  const diagnostics = getFrameIframeDiagnostics(linkedElement);
  if (!diagnostics) {
    return;
  }

  logger.debug('renderInteractiveFrame', {
    frameId: frameData.id,
    ...diagnostics,
    frameData: {
      x: frameData.x,
      y: frameData.y,
      width: frameData.width,
      height: frameData.height,
    },
    offset: frameData.offset,
  });
}
