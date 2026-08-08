import type { FrameData } from '../../../../features/highlighter/contracts';
import { getFrameTriggerPosition } from './trigger-position';

const FRAME_TRIGGER_PLACEMENT_GRACE_MS = 1_000;

export type FrameTriggerPlacementSession = {
  frameId: string;
  hiddenAt: number | null;
  side: ReturnType<typeof getFrameTriggerPosition>['side'];
};

export function suspendFrameTriggerPlacement(
  session: FrameTriggerPlacementSession | null,
  now = Date.now()
): FrameTriggerPlacementSession | null {
  return session && session.hiddenAt === null ? { ...session, hiddenAt: now } : session;
}

export function resolveStableFrameTriggerPosition(args: {
  controlCount: number;
  frame: FrameData;
  now?: number;
  session: FrameTriggerPlacementSession | null;
  uiScale: number;
}) {
  const now = args.now ?? Date.now();
  const canReusePlacement =
    args.session?.frameId === args.frame.id &&
    (args.session.hiddenAt === null ||
      now - args.session.hiddenAt < FRAME_TRIGGER_PLACEMENT_GRACE_MS);
  const position = getFrameTriggerPosition(
    args.frame,
    args.controlCount,
    args.uiScale,
    canReusePlacement ? args.session?.side : undefined
  );
  return {
    position,
    session: { frameId: args.frame.id, hiddenAt: null, side: position.side },
  } satisfies { position: typeof position; session: FrameTriggerPlacementSession };
}
