import type { MutableRefObject } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { getContentUiElementById } from '../../../platform/dom-host';
import { createLogger } from '@sniptale/platform/observability/logger';
import { applyIsolatedContentRootStyle } from '../../../platform/dom-host/isolated';
import type { FrameData, FrameState } from '../../../../features/highlighter/contracts';
import {
  areFrameRenderDescriptorsEqual,
  buildFrameRenderDescriptors,
  type FrameRenderDescriptor,
} from './descriptors';

const logger = createLogger({ namespace: 'ContentFrameRootsRenderer' });

export function prepareFrameRootsRender(args: {
  currentFrameStates: Map<string, FrameState>;
  framesRef: MutableRefObject<FrameData[]>;
  getOrCreateContainer: () => HTMLDivElement;
  isClearingRef: MutableRefObject<boolean>;
  prevRenderDescriptorsRef: MutableRefObject<FrameRenderDescriptor[]>;
  rootsRef: MutableRefObject<Map<string, Root>>;
}) {
  if (args.isClearingRef.current) {
    return null;
  }

  const container = args.getOrCreateContainer();
  if (!container || !container.isConnected) {
    return null;
  }

  const currentFrames = args.framesRef.current;
  syncFrameRoots(container, currentFrames, args.rootsRef);

  const nextRenderDescriptors = buildFrameRenderDescriptors(currentFrames, args.currentFrameStates);
  if (
    areFrameRenderDescriptorsEqual(nextRenderDescriptors, args.prevRenderDescriptorsRef.current)
  ) {
    return null;
  }

  args.prevRenderDescriptorsRef.current = nextRenderDescriptors;
  return { container, currentFrames, currentFrameStates: args.currentFrameStates };
}

function syncFrameRoots(
  container: HTMLDivElement,
  currentFrames: FrameData[],
  rootsRef: MutableRefObject<Map<string, Root>>
) {
  const currentFrameIds = new Set(currentFrames.map((frame) => frame.id));
  const rootsToRemove: string[] = [];

  rootsRef.current.forEach((root, frameId) => {
    if (currentFrameIds.has(frameId)) {
      return;
    }

    rootsToRemove.push(frameId);
    getContentUiElementById(`frame-container-${frameId}`)?.remove();
    scheduleRemovedFrameRootUnmount(root);
  });
  rootsToRemove.forEach((frameId) => rootsRef.current.delete(frameId));

  currentFrames.forEach((frameData) => {
    if (rootsRef.current.has(frameData.id)) {
      return;
    }

    const frameContainer = getOrCreateFrameContainer(container, frameData.id);
    rootsRef.current.set(frameData.id, createRoot(frameContainer));
  });
}

function scheduleRemovedFrameRootUnmount(root: Root) {
  setTimeout(() => {
    try {
      root.unmount();
    } catch (error) {
      logger.error('Error unmounting root', error);
    }
  }, 0);
}

function getOrCreateFrameContainer(container: HTMLDivElement, frameId: string) {
  let frameContainer = getContentUiElementById<HTMLDivElement>(`frame-container-${frameId}`);
  if (frameContainer) {
    return frameContainer;
  }

  frameContainer = document.createElement('div');
  frameContainer.id = `frame-container-${frameId}`;
  applyIsolatedContentRootStyle(
    frameContainer,
    `
      position: absolute;
      top: 0;
      left: 0;
      pointer-events: none;
      z-index: auto;
    `
  );
  container.appendChild(frameContainer);
  return frameContainer;
}
