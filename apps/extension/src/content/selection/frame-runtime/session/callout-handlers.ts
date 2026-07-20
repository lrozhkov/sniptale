import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { CalloutSettings, FrameData } from '../../../../features/highlighter/contracts';
import { createDefaultCalloutSettings } from './callout-defaults';
import type {
  CalloutDeleteDetail,
  FrameCalloutChangedDetail,
} from '../../../platform/page-context/frame-events';

type FrameCalloutDeps = {
  setFrames: Dispatch<SetStateAction<FrameData[]>>;
  sessionCalloutStyleRef: MutableRefObject<Partial<CalloutSettings> | null>;
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
          const newCallout = createDefaultCalloutSettings(
            sessionCalloutStyleRef.current ?? undefined
          );
          sessionCalloutStyleRef.current = newCallout;
          return { ...frame, callout: newCallout };
        }
        if (frame.callout && settings.enabled !== false) {
          return { ...frame, callout: { ...frame.callout, ...settings } };
        }
        if (settings.enabled === false && frame.callout) {
          return { ...frame, callout: { ...frame.callout, enabled: false } };
        }
        return frame;
      })
    );
  };
}

export function createCalloutPopoverSettingsHandler({
  setFrames,
  sessionCalloutStyleRef,
}: FrameCalloutDeps) {
  return ({ frameId, settings }: FrameCalloutChangedDetail) => {
    setFrames((prev) =>
      prev.map((frame) => {
        if (frame.id !== frameId || !frame.callout) {
          return frame;
        }
        sessionCalloutStyleRef.current = {
          ...sessionCalloutStyleRef.current,
          ...frame.callout,
          ...settings,
        };
        return { ...frame, callout: { ...frame.callout, ...settings } };
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
        return { ...frame, callout: { ...frame.callout, enabled: false } };
      })
    );
  };
}
