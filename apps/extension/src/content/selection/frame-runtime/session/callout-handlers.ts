import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { CalloutVisualStyle } from '@sniptale/runtime-contracts/highlighter/callout';
import type { FrameData } from '../../../../features/highlighter/contracts';
import { applyCalloutSettingsPatch } from '../../callout/model';
import { createSessionCalloutSettings } from './callout-defaults';
import type {
  CalloutDeleteDetail,
  FrameCalloutChangedDetail,
} from '../../../platform/page-context/frame-events';

type FrameCalloutDeps = {
  setFrames: Dispatch<SetStateAction<FrameData[]>>;
  sessionCalloutStyleRef: MutableRefObject<CalloutVisualStyle | null>;
};

export function createFrameCalloutChangedHandler({
  setFrames,
  sessionCalloutStyleRef,
}: FrameCalloutDeps) {
  return ({ frameId, settings }: FrameCalloutChangedDetail) => {
    setFrames((prev) =>
      prev.map((frame) => {
        if (frame.id !== frameId) {
          return frame;
        }
        if (settings.enabled === true && !frame.callout) {
          const newCallout = createSessionCalloutSettings(sessionCalloutStyleRef.current);
          return { ...frame, callout: newCallout };
        }
        if (frame.callout && settings.enabled !== false) {
          return { ...frame, callout: applyCalloutSettingsPatch(frame.callout, settings) };
        }
        if (settings.enabled === false && frame.callout) {
          return {
            ...frame,
            callout: applyCalloutSettingsPatch(frame.callout, { enabled: false }),
          };
        }
        return frame;
      })
    );
  };
}

export function createCalloutPopoverSettingsHandler({
  setFrames,
}: Pick<FrameCalloutDeps, 'setFrames'>) {
  return ({ frameId, settings }: FrameCalloutChangedDetail) => {
    setFrames((prev) =>
      prev.map((frame) => {
        if (frame.id !== frameId || !frame.callout) {
          return frame;
        }
        const nextCallout = applyCalloutSettingsPatch(frame.callout, settings);
        return { ...frame, callout: nextCallout };
      })
    );
  };
}

export function createCalloutDeleteHandler(setFrames: Dispatch<SetStateAction<FrameData[]>>) {
  return ({ frameId }: CalloutDeleteDetail) => {
    setFrames((prev) =>
      prev.map((frame) => {
        if (frame.id !== frameId || !frame.callout) {
          return frame;
        }
        return {
          ...frame,
          callout: applyCalloutSettingsPatch(frame.callout, { enabled: false }),
        };
      })
    );
  };
}
