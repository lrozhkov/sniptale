import type {
  CalloutAnchor,
  CalloutSettings,
} from '@sniptale/runtime-contracts/highlighter/callout';
import type { FrameAnnotationVisualState } from '../model';

export const MAX_FRAME_CALLOUTS = 5;
export const PRIMARY_FRAME_CALLOUT_INDEX = 0;

let calloutInstanceSequence = 0;

function createCalloutInstanceId(): string {
  const randomId = globalThis.crypto?.randomUUID?.();
  if (randomId) return randomId;
  calloutInstanceSequence += 1;
  return `callout-${Date.now().toString(36)}-${calloutInstanceSequence.toString(36)}`;
}

const PLACEMENT_ORDER: readonly CalloutAnchor[] = [
  'bottom-center',
  'top-center',
  'middle-right',
  'middle-left',
  'bottom-right',
  'bottom-left',
  'top-right',
  'top-left',
];

const OPPOSITE_ANCHOR: Partial<Record<CalloutAnchor, CalloutAnchor>> = {
  'bottom-center': 'top-center',
  'bottom-left': 'top-right',
  'bottom-right': 'top-left',
  'middle-left': 'middle-right',
  'middle-right': 'middle-left',
  'top-center': 'bottom-center',
  'top-left': 'bottom-right',
  'top-right': 'bottom-left',
};

export function getFrameCallouts(frame: FrameAnnotationVisualState): CalloutSettings[] {
  return [...(frame.callout ? [frame.callout] : []), ...(frame.additionalCallouts ?? [])].slice(
    0,
    MAX_FRAME_CALLOUTS
  );
}

export function canAppendFrameCallout(frame: FrameAnnotationVisualState): boolean {
  return frame.callout?.enabled === true && getFrameCallouts(frame).length < MAX_FRAME_CALLOUTS;
}

export function getFrameCallout(
  frame: FrameAnnotationVisualState,
  calloutIndex: number
): CalloutSettings | undefined {
  if (calloutIndex === PRIMARY_FRAME_CALLOUT_INDEX) return frame.callout;
  return frame.additionalCallouts?.[calloutIndex - 1];
}

export function getFrameCalloutKey(
  frame: FrameAnnotationVisualState,
  calloutIndex: number
): string {
  return getFrameCallout(frame, calloutIndex)?.instanceId ?? `${frame.id}:callout:${calloutIndex}`;
}

export function setFrameCallout<Frame extends FrameAnnotationVisualState>(
  frame: Frame,
  calloutIndex: number,
  settings: CalloutSettings
): Frame {
  if (calloutIndex === PRIMARY_FRAME_CALLOUT_INDEX) return { ...frame, callout: settings };
  const additionalIndex = calloutIndex - 1;
  if (additionalIndex < 0 || additionalIndex >= (frame.additionalCallouts?.length ?? 0))
    return frame;
  const additionalCallouts = [...(frame.additionalCallouts ?? [])];
  additionalCallouts[additionalIndex] = settings;
  return { ...frame, additionalCallouts };
}

export function removeFrameCallout<Frame extends FrameAnnotationVisualState>(
  frame: Frame,
  calloutIndex: number
): Frame {
  if (calloutIndex === PRIMARY_FRAME_CALLOUT_INDEX) {
    return frame.callout ? { ...frame, callout: { ...frame.callout, enabled: false } } : frame;
  }
  const additionalIndex = calloutIndex - 1;
  if (additionalIndex < 0 || additionalIndex >= (frame.additionalCallouts?.length ?? 0))
    return frame;
  const additionalCallouts = (frame.additionalCallouts ?? []).filter(
    (_, index) => index !== additionalIndex
  );
  if (additionalCallouts.length === 0) {
    return { ...frame, additionalCallouts: [] };
  }
  return {
    ...frame,
    additionalCallouts,
  };
}

export function appendFrameCallout<Frame extends FrameAnnotationVisualState>(
  frame: Frame,
  fallback: CalloutSettings
): { frame: Frame; calloutIndex: number } | null {
  const additionalCallouts = frame.additionalCallouts ?? [];
  if (additionalCallouts.length >= MAX_FRAME_CALLOUTS - 1) return null;
  const primaryCallout = frame.callout ?? { ...structuredClone(fallback), enabled: false };
  const source = primaryCallout;
  const occupiedAnchors = new Set(
    [primaryCallout, ...additionalCallouts].map((callout) => callout.placement.anchor)
  );
  const oppositePrimaryAnchor = OPPOSITE_ANCHOR[primaryCallout.placement.anchor];
  const anchor =
    (oppositePrimaryAnchor && !occupiedAnchors.has(oppositePrimaryAnchor)
      ? oppositePrimaryAnchor
      : PLACEMENT_ORDER.find((candidate) => !occupiedAnchors.has(candidate))) ?? 'bottom-center';
  const nextCallout: CalloutSettings = {
    ...structuredClone(source),
    enabled: true,
    instanceId: createCalloutInstanceId(),
    content: { bodyHtml: '', titleText: '' },
    placement: {
      ...structuredClone(source.placement),
      anchor,
      side: 'auto',
      manualPlacement: undefined,
      connectorAttachments: {
        block: { mode: 'auto' },
        frame: { mode: 'auto' },
      },
      connectorBasePosition: undefined,
      connectorBaseWidth: undefined,
      connectorFramePosition: undefined,
      connectorWaypoint: undefined,
    },
  };
  return {
    frame: {
      ...frame,
      callout: primaryCallout,
      additionalCallouts: [...additionalCallouts, nextCallout],
    },
    calloutIndex: additionalCallouts.length + 1,
  };
}
