import { createElement } from 'react';
import type { MutableRefObject } from 'react';
import type { EffectMode, FrameData, FrameState } from '../../../../features/highlighter/contracts';
import type { InteractiveFrameComponent } from './component';

export type FrameRootActionRefs = {
  updateFrameStateRef: MutableRefObject<(frameId: string, newState: FrameState) => void>;
  updateFrameRef: MutableRefObject<(frameId: string, newFrame: FrameData) => void>;
  removeFrameRef: MutableRefObject<(frameId: string) => void>;
  updateFrameEffectRef: MutableRefObject<(frameId: string, mode: EffectMode) => void>;
};

export function createInteractiveFrameElement(args: {
  actionRefs: FrameRootActionRefs;
  frameData: FrameData;
  globalEffectModeRef: MutableRefObject<EffectMode>;
  InteractiveFrameComponent: InteractiveFrameComponent;
  zIndex: number;
}) {
  return createElement(args.InteractiveFrameComponent, {
    defaultEffectMode: args.globalEffectModeRef.current,
    frame: args.frameData,
    onCancel: () => {},
    onDelete: () => args.actionRefs.removeFrameRef.current(args.frameData.id),
    onEffectChange: (frameId: string, mode: EffectMode) =>
      args.actionRefs.updateFrameEffectRef.current(frameId, mode),
    onStateChange: (newState: FrameState) =>
      args.actionRefs.updateFrameStateRef.current(args.frameData.id, newState),
    onUpdate: (newFrame: FrameData) =>
      args.actionRefs.updateFrameRef.current(args.frameData.id, newFrame),
    zIndex: args.zIndex,
  });
}
