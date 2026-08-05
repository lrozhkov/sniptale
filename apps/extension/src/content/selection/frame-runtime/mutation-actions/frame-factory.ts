import type {
  AppliedBorderSettings,
  FrameData,
  FreeFrameInput,
} from '../../../../features/highlighter/contracts';
import { createFrameDataFromElement } from '../manager/coords';
import { buildFrameForAdd, buildFreeFrameForAdd } from './frame-build';
import { applyAddedFrameSideEffects } from './frame-post-add';
import type { UseFrameMutationActionHelperOptions } from './types';
import { requestFrameCalloutEdit, useFrameUIStore } from '../state/frame-ui.store';

type CreateAddFrameHandlerArgs = Pick<
  UseFrameMutationActionHelperOptions,
  | 'setFrames'
  | 'hostLayoutServiceRef'
  | 'globalEffectModeRef'
  | 'globalStepBadgeAutoModeRef'
  | 'sessionBlurSettingsRef'
  | 'sessionFocusSettingsRef'
  | 'sessionStepBadgeTemplateRef'
  | 'recalculateStepBadgesRef'
> & {
  calculateFrameCoords: (element: HTMLElement, borderSettings?: AppliedBorderSettings) => FrameData;
};

export function createGenerateFrameId() {
  return () => `sniptale-frame-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function createCalculateFrameCoords(generateFrameId: () => string) {
  return (element: HTMLElement, borderSettings?: AppliedBorderSettings): FrameData =>
    createFrameDataFromElement(generateFrameId(), element, borderSettings);
}

export function createAddFrameHandler({
  setFrames,
  hostLayoutServiceRef,
  globalEffectModeRef,
  globalStepBadgeAutoModeRef,
  sessionBlurSettingsRef,
  sessionFocusSettingsRef,
  sessionStepBadgeTemplateRef,
  recalculateStepBadgesRef,
  calculateFrameCoords,
}: CreateAddFrameHandlerArgs) {
  return (element: HTMLElement) => {
    if (!element.isConnected) {
      return null;
    }

    const frameData = buildFrameForAdd({
      calculateFrameCoords,
      element,
      globalEffectModeRef,
      globalStepBadgeAutoModeRef,
      sessionBlurSettingsRef,
      sessionFocusSettingsRef,
      sessionStepBadgeTemplateRef,
    });

    const selector = frameData.linkedElementSelector;
    const placement = frameData.pagePlacement;
    const accepted =
      selector && placement
        ? hostLayoutServiceRef.current.link(
            frameData.id,
            element,
            selector,
            {
              pagePlacement: placement,
              rect: {
                x: frameData.x,
                y: frameData.y,
                width: frameData.width,
                height: frameData.height,
              },
            },
            { requireAcceptedInitial: true }
          )
        : null;
    if (!accepted) return null;

    const acceptedFrameData = {
      ...frameData,
      ...accepted.rect,
      pagePlacement: accepted.pagePlacement,
    };
    if (acceptedFrameData.callout?.enabled) {
      requestFrameCalloutEdit(acceptedFrameData.id);
    }
    setFrames((prev) => [...prev, acceptedFrameData]);
    applyAddedFrameSideEffects({
      frameData: acceptedFrameData,
      isAutoMode: globalStepBadgeAutoModeRef.current,
      recalculateStepBadgesRef,
    });
    return acceptedFrameData;
  };
}

export function createAddFreeFrameHandler(
  args: Omit<CreateAddFrameHandlerArgs, 'calculateFrameCoords'> & {
    generateFrameId: () => string;
  }
) {
  return (input: FreeFrameInput) => {
    const frameData = buildFreeFrameForAdd({
      globalEffectModeRef: args.globalEffectModeRef,
      globalStepBadgeAutoModeRef: args.globalStepBadgeAutoModeRef,
      sessionBlurSettingsRef: args.sessionBlurSettingsRef,
      sessionFocusSettingsRef: args.sessionFocusSettingsRef,
      sessionStepBadgeTemplateRef: args.sessionStepBadgeTemplateRef,
      generateFrameId: args.generateFrameId,
      input,
    });
    if (frameData.callout?.enabled) {
      requestFrameCalloutEdit(frameData.id);
    }
    args.setFrames((prev) => [...prev, frameData]);
    applyAddedFrameSideEffects({
      frameData,
      isAutoMode: args.globalStepBadgeAutoModeRef.current,
      recalculateStepBadgesRef: args.recalculateStepBadgesRef,
    });
    useFrameUIStore.getState().selectFrame(frameData.id);
    return frameData;
  };
}
