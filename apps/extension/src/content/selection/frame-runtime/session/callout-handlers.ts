import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { CalloutVisualStyle } from '@sniptale/runtime-contracts/highlighter/callout';
import type { FrameData } from '../../../../features/highlighter/contracts';
import { applyCalloutSettingsPatch } from '../../../../features/highlighter/frame-annotation/callout/model';
import { createSessionCalloutSettings } from './callout-defaults';
import {
  getFrameCallout,
  PRIMARY_FRAME_CALLOUT_INDEX,
  removeFrameCallout,
  setFrameCallout,
} from '../../../../features/highlighter/frame-annotation/callout/collection';
import type {
  CalloutDeleteDetail,
  FrameCalloutChangedDetail,
} from '../../../platform/page-context/frame-events';
import {
  reconcileLinkedAnnotationTemplatesWhenReady,
  resolveFrameCalloutTemplate,
} from './linked-annotation-templates';

type FrameCalloutDeps = {
  setFrames: Dispatch<SetStateAction<FrameData[]>>;
  sessionCalloutStyleRef: MutableRefObject<CalloutVisualStyle | null>;
};

export function createFrameCalloutChangedHandler({
  setFrames,
  sessionCalloutStyleRef,
}: FrameCalloutDeps) {
  return ({
    calloutIndex = PRIMARY_FRAME_CALLOUT_INDEX,
    frameId,
    settings,
  }: FrameCalloutChangedDetail) => {
    const fallback = createSessionCalloutSettings(sessionCalloutStyleRef.current);
    setFrames((prev) =>
      prev.map((frame) => {
        if (frame.id !== frameId) {
          return frame;
        }
        if (
          calloutIndex === PRIMARY_FRAME_CALLOUT_INDEX &&
          settings.enabled === true &&
          !frame.callout
        ) {
          const newCallout = resolveFrameCalloutTemplate(fallback, frame.borderSettings);
          return { ...frame, callout: newCallout };
        }
        const callout = getFrameCallout(frame, calloutIndex);
        if (callout && settings.enabled !== false) {
          return setFrameCallout(frame, calloutIndex, applyCalloutSettingsPatch(callout, settings));
        }
        if (settings.enabled === false && callout) {
          return setFrameCallout(
            frame,
            calloutIndex,
            applyCalloutSettingsPatch(callout, { enabled: false })
          );
        }
        return frame;
      })
    );
    if (calloutIndex === PRIMARY_FRAME_CALLOUT_INDEX && settings.enabled === true) {
      reconcileLinkedAnnotationTemplatesWhenReady({
        ...(fallback.sourcePresetId
          ? { expectedCalloutSourcePresetId: fallback.sourcePresetId }
          : {}),
        frameId,
        setFrames,
      });
    }
  };
}

export function createCalloutPopoverSettingsHandler({
  setFrames,
}: Pick<FrameCalloutDeps, 'setFrames'>) {
  return ({
    calloutIndex = PRIMARY_FRAME_CALLOUT_INDEX,
    frameId,
    settings,
  }: FrameCalloutChangedDetail) => {
    setFrames((prev) =>
      prev.map((frame) => {
        const callout = getFrameCallout(frame, calloutIndex);
        if (frame.id !== frameId || !callout) {
          return frame;
        }
        const nextCallout = applyCalloutSettingsPatch(callout, settings);
        return setFrameCallout(frame, calloutIndex, nextCallout);
      })
    );
  };
}

export function createCalloutDeleteHandler(setFrames: Dispatch<SetStateAction<FrameData[]>>) {
  return ({ calloutIndex = PRIMARY_FRAME_CALLOUT_INDEX, frameId }: CalloutDeleteDetail) => {
    setFrames((prev) =>
      prev.map((frame) => {
        if (frame.id !== frameId || !getFrameCallout(frame, calloutIndex)) {
          return frame;
        }
        return removeFrameCallout(frame, calloutIndex);
      })
    );
  };
}
