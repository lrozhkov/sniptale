import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { getContentRuntimeServices } from '../../platform/runtime-services/services';
import {
  inferRecordingClockOffset,
  type RecordingClockExchange,
  type RecordingClockOffset,
} from '../../../platform/media-utils/recording-clock-synchronization';
import {
  isRecordingClockTiming,
  matchesRecordingFrameClockBinding,
  type RecordingFrameClockAnchor,
  type RecordingFrameClockBinding,
} from '../../../contracts/video/recording-frame-clock';

type Localization =
  | { status: 'stale' | 'unavailable' }
  | { status: 'ready'; anchor: RecordingFrameClockAnchor };
/** One source-document lifetime owns its disposable measured binding, never the recording itself. */
export function createRecordingClockSynchronizer(
  exchange: (binding: RecordingFrameClockBinding) => Promise<unknown> = (binding) =>
    getContentRuntimeServices().messaging.sendRuntimeMessage({
      type: VideoMessageType.GET_RECORDING_STATE,
      recordingClock: binding,
    }),
  readClock: () => number = () => performance.timeOrigin + performance.now()
) {
  let sequence = 0;
  let current: { binding: RecordingFrameClockBinding; offset: RecordingClockOffset } | null = null;
  function localized(
    anchor: RecordingFrameClockAnchor,
    offset: RecordingClockOffset
  ): Localization {
    const uncertaintyMs = (anchor.uncertaintyMs ?? 0) + offset.uncertaintyMs;
    const captureEpochMs = anchor.captureEpochMs - offset.offsetMs;
    if (!Number.isFinite(captureEpochMs) || captureEpochMs <= 0) return { status: 'unavailable' };
    return { status: 'ready', anchor: { ...anchor, captureEpochMs, uncertaintyMs } };
  }
  return {
    invalidate() {
      sequence++;
      current = null;
    },
    async localize(anchor: RecordingFrameClockAnchor, refresh = false): Promise<Localization> {
      const request = ++sequence;
      if (!refresh && current && matchesRecordingFrameClockBinding(current.binding, anchor))
        return localized(anchor, current.offset);
      const binding = {
        recordingId: anchor.recordingId,
        generation: anchor.generation,
        streamInstanceId: anchor.streamInstanceId,
      };
      const samples: RecordingClockExchange[] = [];
      try {
        for (let index = 0; index < 5; index++) {
          const a0 = readClock();
          const reply = await exchange(binding);
          const a3 = readClock();
          if (request !== sequence) return { status: 'stale' };
          if (
            typeof reply !== 'object' ||
            reply === null ||
            !('success' in reply) ||
            reply.success !== true ||
            !('clockTiming' in reply) ||
            !isRecordingClockTiming(reply.clockTiming) ||
            !matchesRecordingFrameClockBinding(binding, reply.clockTiming)
          )
            return { status: 'unavailable' };
          const timing = reply.clockTiming;
          samples.push({ a0, b1: timing.receivedAtMs, b2: timing.repliedAtMs, a3 });
          if (index < 2) continue;
          const offset = inferRecordingClockOffset(samples);
          if (offset) {
            current = { binding, offset };
            return localized(anchor, offset);
          }
        }
      } catch {
        if (request !== sequence) return { status: 'stale' };
      }
      return { status: 'unavailable' };
    },
  };
}
