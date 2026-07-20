import type { MutableRefObject } from 'react';
import type { Root } from 'react-dom/client';
import type { EffectMode, FrameData, FrameState } from '../../../../features/highlighter/contracts';
import type { InteractiveFrameComponent } from './component';
import type { FrameRootActionRefs } from './element';
import { renderInteractiveFrames } from './dom';

export function renderPreparedFrameRoots(args: {
  actionRefs: FrameRootActionRefs;
  globalEffectModeRef: MutableRefObject<EffectMode>;
  InteractiveFrameComponent: InteractiveFrameComponent;
  renderState: {
    container: HTMLDivElement;
    currentFrames: FrameData[];
    currentFrameStates: Map<string, FrameState>;
  };
  rootsRef: MutableRefObject<Map<string, Root>>;
}) {
  let cancelled = false;

  renderInteractiveFrames({
    actionRefs: args.actionRefs,
    cancelled,
    container: args.renderState.container,
    currentFrames: args.renderState.currentFrames,
    currentFrameStates: args.renderState.currentFrameStates,
    globalEffectModeRef: args.globalEffectModeRef,
    InteractiveFrameComponent: args.InteractiveFrameComponent,
    rootsRef: args.rootsRef,
  });

  return () => {
    cancelled = true;
  };
}
