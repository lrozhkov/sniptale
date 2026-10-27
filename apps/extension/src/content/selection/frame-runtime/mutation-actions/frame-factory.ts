import type {
  AppliedBorderSettings,
  FrameData,
  FreeFrameInput,
} from '../../../../features/highlighter/contracts';
import { createFrameDataFromElement, calculateFrameOffsetFromElement } from '../manager/coords';
import { createCompositeSelector } from '../../../platform/frame/selectors';
import {
  buildFrameForAdd,
  buildFreeFrameForAdd,
  buildStandaloneAnnotationForAdd,
} from './frame-build';
import { applyAddedFrameSideEffects } from './frame-post-add';
import type { UseFrameMutationActionHelperOptions } from './types';
import { requestFrameCalloutEdit, useFrameUIStore } from '../state/frame-ui.store';
import { reconcileLinkedAnnotationTemplatesWhenReady } from '../session/linked-annotation-templates';

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
    reconcileLinkedAnnotationTemplatesWhenReady({
      ...(acceptedFrameData.callout?.sourcePresetId
        ? { expectedCalloutSourcePresetId: acceptedFrameData.callout.sourcePresetId }
        : {}),
      ...(acceptedFrameData.stepBadge?.sourcePresetId
        ? { expectedStepBadgeSourcePresetId: acceptedFrameData.stepBadge.sourcePresetId }
        : {}),
      frameId: acceptedFrameData.id,
      setFrames,
    });
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
  return (input: FreeFrameInput, sourceElement?: HTMLElement) => {
    const buildArgs = {
      globalEffectModeRef: args.globalEffectModeRef,
      globalStepBadgeAutoModeRef: args.globalStepBadgeAutoModeRef,
      sessionBlurSettingsRef: args.sessionBlurSettingsRef,
      sessionFocusSettingsRef: args.sessionFocusSettingsRef,
      sessionStepBadgeTemplateRef: args.sessionStepBadgeTemplateRef,
      generateFrameId: args.generateFrameId,
      input,
    };
    const built =
      input.annotationKind === undefined
        ? buildFreeFrameForAdd(buildArgs)
        : buildStandaloneAnnotationForAdd({ ...buildArgs, annotationKind: input.annotationKind });
    const frameData =
      built.annotationKind && sourceElement
        ? linkStandaloneAnnotation(built, sourceElement, args.hostLayoutServiceRef.current)
        : built;
    if (frameData.callout?.enabled) {
      requestFrameCalloutEdit(frameData.id);
    }
    args.setFrames((prev) => [...prev, frameData]);
    reconcileLinkedAnnotationTemplatesWhenReady({
      ...(frameData.callout?.sourcePresetId
        ? { expectedCalloutSourcePresetId: frameData.callout.sourcePresetId }
        : {}),
      ...(frameData.stepBadge?.sourcePresetId
        ? { expectedStepBadgeSourcePresetId: frameData.stepBadge.sourcePresetId }
        : {}),
      frameId: frameData.id,
      setFrames: args.setFrames,
    });
    applyAddedFrameSideEffects({
      frameData,
      isAutoMode: args.globalStepBadgeAutoModeRef.current,
      recalculateStepBadgesRef: args.recalculateStepBadgesRef,
    });
    useFrameUIStore.getState().clearSelection();
    return frameData;
  };
}

function linkStandaloneAnnotation(
  frame: FrameData,
  element: HTMLElement,
  hostLayout: CreateAddFrameHandlerArgs['hostLayoutServiceRef']['current']
): FrameData {
  if (!element.isConnected || !frame.pagePlacement) return frame;
  const selector = createCompositeSelector(element);
  const linkedElementSelector = selector.iframeSelector
    ? `${selector.iframeSelector} => ${selector.elementSelector}`
    : selector.elementSelector;
  const accepted = hostLayout.link(
    frame.id,
    element,
    linkedElementSelector,
    {
      pagePlacement: frame.pagePlacement,
      rect: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
    },
    { requireAcceptedInitial: true }
  );
  if (!accepted) return frame;
  return {
    ...frame,
    ...accepted.rect,
    pagePlacement: accepted.pagePlacement,
    linkedElementSelector,
    offset: calculateFrameOffsetFromElement(frame, element),
  };
}
