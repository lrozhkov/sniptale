import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import type {
  AppliedBorderSettings,
  BlurSettings,
  EffectMode,
  FocusSettings,
  StepBadgeSettings,
} from '../../../../features/highlighter/contracts';
import {
  addContentRuntimeDetailEventListener,
  dispatchContentRuntimeDetailEvent,
  type ContentRuntimeEventTarget,
} from '../event-bus';

export type FutureFrameDefaultsChangedDetail =
  | {
      kind: 'frame';
      settings: {
        blurSettings: BlurSettings;
        borderSettings: AppliedBorderSettings;
        effectMode: EffectMode;
        focusSettings: FocusSettings;
      };
    }
  | { kind: 'callout'; settings: CalloutSettings }
  | { kind: 'stepBadge'; settings: StepBadgeSettings };

const FUTURE_FRAME_DEFAULTS_CHANGED_EVENT = 'sniptale-future-frame-defaults-changed';

export function dispatchFutureFrameDefaultsChanged(
  detail: FutureFrameDefaultsChangedDetail,
  target?: ContentRuntimeEventTarget
): void {
  dispatchContentRuntimeDetailEvent(FUTURE_FRAME_DEFAULTS_CHANGED_EVENT, detail, target);
}

export function addFutureFrameDefaultsChangedListener(
  listener: (detail: FutureFrameDefaultsChangedDetail) => void,
  target?: ContentRuntimeEventTarget
): () => void {
  return addContentRuntimeDetailEventListener(
    FUTURE_FRAME_DEFAULTS_CHANGED_EVENT,
    listener,
    target
  );
}
