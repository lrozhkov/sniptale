import { createRecordingHistoryIntake, waitForRecordingHistoryStop } from '../history-intake';
import {
  isRecordingCursorObservationPacket,
  type RecordingCursorObservationPacket,
  type RecordingCursorPointObservation,
} from '../../../contracts/video/cursor-observations';
import { createCursorTrajectoryBlockPacker } from '../../../features/video/project/cursor-trajectory/blocks';
import { createCursorTrajectoryWindowRecorder } from '../../../features/video/project/cursor-trajectory/simplify';
import { isTrajectoryInteger } from '../../../features/video/project/cursor-trajectory/records';
import type {
  CursorTrajectoryAnchor,
  CursorTrajectoryBoundaryReason,
  CursorTrajectoryDescriptor,
  CursorTrajectoryRecord,
  CursorTrajectorySample,
  CursorTrajectorySegment,
} from '../../../features/video/project/cursor-trajectory/types';
import type { RecordingPointTransform } from '../../../features/video/project/types';
import type { createRecordingCursorTrajectoryStore } from '../../../composition/persistence/recordings/cursor-trajectory/store';
import type { RecordingCursorTrajectoryHead } from '../../../composition/persistence/recordings/cursor-trajectory/contracts';

type CursorStore = ReturnType<typeof createRecordingCursorTrajectoryStore>;

function descriptor(head: RecordingCursorTrajectoryHead): CursorTrajectoryDescriptor {
  return {
    format: 'cursor-trajectory-v1',
    formatVersion: 1,
    algorithm: 'sed-window-v1',
    encoding: 'json-ascii-int-v1',
    trajectoryId: head.trajectoryId,
    state: head.state,
    finalized: head.finalized,
    totalBlocks: head.totalBlocks,
    totalRecords: head.totalRecords,
    totalSamples: head.totalSamples,
    totalBytes: head.totalBytes,
    streamSha256: head.streamSha256,
  };
}

function projectPoint(
  input: RecordingCursorPointObservation,
  packet: RecordingCursorObservationPacket,
  transform: RecordingPointTransform | null,
  width: number,
  height: number
) {
  const admitted =
    transform !== null &&
    Object.entries(transform.viewport).every(([name, value]) =>
      Object.entries(packet.viewport).some(([key, actual]) => key === name && actual === value)
    );
  if (!input.observed || input.x === null || input.y === null)
    return { observed: false, visible: false, xQ8: null, yQ8: null, unavailable: false };
  if (!admitted || !transform)
    return { observed: false, visible: false, xQ8: null, yQ8: null, unavailable: true };
  const rect = transform.visibleClientRect;
  if (
    input.x < rect.x ||
    input.y < rect.y ||
    input.x >= rect.x + rect.width ||
    input.y >= rect.y + rect.height
  )
    return { observed: false, visible: false, xQ8: null, yQ8: null, unavailable: false };
  const xQ8 = Math.floor((input.x * transform.scaleX + transform.offsetX) * width * 256 + 0.5);
  const yQ8 = Math.floor((input.y * transform.scaleY + transform.offsetY) * height * 256 + 0.5);
  if (
    !isTrajectoryInteger(xQ8) ||
    !isTrajectoryInteger(yQ8) ||
    xQ8 >= width * 256 ||
    yQ8 >= height * 256
  )
    return { observed: false, visible: false, xQ8: null, yQ8: null, unavailable: true };
  return { observed: true, visible: input.visible, xQ8, yQ8, unavailable: false };
}

/** Recording-owned cursor intake. Only the background's admitted source identity reaches this owner. */
export async function createBrowserCursorTrajectoryWriter(options: {
  recordingId: string;
  trajectoryId: string;
  width: number;
  height: number;
  store: CursorStore;
  pointTransform(): RecordingPointTransform | null;
}) {
  const { recordingId, trajectoryId, width, height, store } = options;
  const identity = { recordingId, trajectoryId };
  const writer = await store.begin(identity, { width, height });
  const window = createCursorTrajectoryWindowRecorder<CursorTrajectorySample>();
  const packer = createCursorTrajectoryBlockPacker(recordingId, trajectoryId);
  let active: CursorTrajectorySegment | null = null;
  let segmentId = -1;
  let observationSeq = 0;
  let lastTime = 0;
  let lastSample: CursorTrajectorySample | null = null;
  let lastEmittedSequence = -1;
  let lastBoundary: CursorTrajectoryBoundaryReason | null = null;
  let documentId: string | null = null;
  let clockKey: string | null = null;
  let lastBatchSequence = -1;
  let lastBatchDigest = '';
  let lastLocalSequence = -1;
  let unknownLocalGap = false;
  let hadGap = false;
  let sourceStopped = false;
  let blockedClock = false;
  let unavailableGeometry = false;
  const releasedUps = new Map<
    CursorTrajectorySample['button'],
    { localSequence: number; observationSeq: number }
  >();
  let signalStop!: () => void;
  const stopped = new Promise<void>((resolve) => {
    signalStop = resolve;
  });

  const emit = async (record: CursorTrajectoryRecord) => {
    for (const block of packer.append(record)) await store.append(writer, block);
    if (record.kind === 'sample') lastEmittedSequence = record.observationSeq;
  };
  const flush = async () => {
    for (const sample of window.flush()) await emit(sample);
  };
  const markLast = (anchor: CursorTrajectoryAnchor) => {
    if (lastSample && lastSample.observationSeq > lastEmittedSequence)
      lastSample.anchors = [...new Set([...lastSample.anchors, anchor])].sort();
  };
  const boundary = async (reason: CursorTrajectoryBoundaryReason, time: number) => {
    if (active) {
      markLast(
        reason === 'stop' || reason === 'pause'
          ? reason
          : reason === 'geometry'
            ? 'geometry'
            : reason === 'visibility'
              ? 'visibility'
              : 'observation'
      );
      await flush();
      await emit({ kind: 'boundary', segmentId: active.segmentId, activeTimeUs: time, reason });
      active = null;
    }
    lastBoundary = reason;
    lastTime = time;
  };
  const begin = async (
    time: number,
    reason: CursorTrajectorySegment['reason'],
    clock: CursorTrajectorySegment['clock']
  ) => {
    segmentId += 1;
    if (!isTrajectoryInteger(segmentId)) throw new Error('CURSOR_TRAJECTORY_INTEGER_RANGE');
    active = {
      kind: 'segment',
      segmentId,
      activeTimeUs: time,
      width,
      height,
      clock: structuredClone(clock),
      reason,
    };
    lastSample = null;
    await emit(active);
  };
  const gap = async (
    from: number,
    to: number | null,
    reason: 'input-overflow' | 'source-unavailable' | 'clock-discontinuity',
    clock: CursorTrajectorySegment['clock'],
    firstLostObservationSeq: number | null = null,
    lastLostObservationSeq: number | null = null
  ) => {
    if (!active) await begin(from, segmentId < 0 ? 'start' : 'after-gap', clock);
    await flush();
    await emit({
      kind: 'gap',
      segmentId,
      fromTimeUs: from,
      toTimeUs: to,
      firstLostObservationSeq,
      lastLostObservationSeq,
      reason,
    });
    active = null;
    hadGap = true;
    lastTime = to ?? from;
    lastBoundary = null;
    releasedUps.clear();
  };

  const point = async (
    input: RecordingCursorPointObservation,
    packet: RecordingCursorObservationPacket,
    transform: RecordingPointTransform | null
  ) => {
    if (
      (!unknownLocalGap && input.localSequence !== lastLocalSequence + 1) ||
      input.localSequence <= lastLocalSequence
    )
      throw new Error('CURSOR_TRAJECTORY_SOURCE_SEQUENCE');
    lastLocalSequence = input.localSequence;
    unknownLocalGap = false;
    const seq = observationSeq++;
    if (!isTrajectoryInteger(seq)) throw new Error('CURSOR_TRAJECTORY_INTEGER_RANGE');
    if (input.activeTimeUs < lastTime) {
      if (!blockedClock) await gap(lastTime, null, 'clock-discontinuity', packet.clock);
      blockedClock = true;
      return;
    }
    blockedClock = false;
    const projected = projectPoint(input, packet, transform, width, height);
    if (projected.unavailable && !unavailableGeometry)
      await gap(lastTime, input.activeTimeUs, 'source-unavailable', packet.clock);
    unavailableGeometry = projected.unavailable;
    if (
      active &&
      lastSample &&
      (lastSample.observed !== projected.observed || lastSample.visible !== projected.visible)
    )
      await boundary(
        lastSample.visible !== projected.visible ? 'visibility' : 'observation',
        input.activeTimeUs
      );
    if (
      active &&
      lastSample &&
      lastSample.activeTimeUs === input.activeTimeUs &&
      (lastSample.xQ8 !== projected.xQ8 || lastSample.yQ8 !== projected.yQ8)
    )
      await boundary('zero-time-discontinuity', input.activeTimeUs);
    const fresh = !active;
    if (!active)
      await begin(
        input.activeTimeUs,
        segmentId < 0
          ? 'start'
          : lastBoundary === 'pause'
            ? 'resume'
            : hadGap
              ? 'after-gap'
              : 'observation',
        packet.clock
      );
    const up = releasedUps.get(input.button);
    const related =
      input.event === 'click' && up && up.localSequence === input.relatedLocalSequence
        ? up.observationSeq
        : null;
    const sample: CursorTrajectorySample = {
      kind: 'sample',
      segmentId,
      observationSeq: seq,
      activeTimeUs: input.activeTimeUs,
      xQ8: projected.xQ8,
      yQ8: projected.yQ8,
      visible: projected.visible,
      observed: projected.observed,
      event: input.event,
      button: input.button,
      relatedObservationSeq: related,
      anchors: fresh
        ? [segmentId === 0 ? 'start' : lastBoundary === 'pause' ? 'resume' : 'observation']
        : [],
    };
    lastSample = sample;
    lastTime = input.activeTimeUs;
    for (const retained of window.append(sample)) await emit(retained);
    if (input.event === 'up')
      releasedUps.set(input.button, { localSequence: input.localSequence, observationSeq: seq });
    if (input.event === 'down' || input.event === 'click') releasedUps.delete(input.button);
  };

  const process = async (
    packet: RecordingCursorObservationPacket,
    nativeDocumentId: string,
    digest: string
  ) => {
    if (intake.failed) throw new Error('CURSOR_TRAJECTORY_STORAGE_UNAVAILABLE');
    const changedDocument = documentId !== nativeDocumentId;
    if (!changedDocument && packet.batchSequence === lastBatchSequence) {
      if (digest !== lastBatchDigest) throw new Error('CURSOR_TRAJECTORY_CONFLICT');
      return;
    }
    if (packet.batchSequence !== (changedDocument ? 0 : lastBatchSequence + 1))
      throw new Error('CURSOR_TRAJECTORY_BATCH_SEQUENCE');
    const first = packet.records[0]!;
    const firstTime = first.kind === 'gap' ? first.fromTimeUs : first.activeTimeUs;
    const nextClockKey = [
      nativeDocumentId,
      packet.sourceClockId,
      packet.clockRevision,
      JSON.stringify(packet.clock),
    ].join(':');
    if (changedDocument) {
      if (documentId !== null && active)
        await gap(lastTime, Math.max(lastTime, firstTime), 'source-unavailable', packet.clock);
      documentId = nativeDocumentId;
      lastLocalSequence = -1;
      unknownLocalGap = false;
      releasedUps.clear();
      sourceStopped = false;
    }
    if (clockKey !== null && clockKey !== nextClockKey && active) {
      if (firstTime < lastTime) await gap(lastTime, null, 'clock-discontinuity', packet.clock);
      else await boundary('clock-discontinuity', firstTime);
    }
    clockKey = nextClockKey;
    const transform = options.pointTransform();
    for (const input of packet.records) {
      if (input.kind === 'sample') await point(input, packet, transform);
      else if (input.kind === 'boundary') {
        if (input.activeTimeUs < lastTime) {
          if (!blockedClock) await gap(lastTime, null, 'clock-discontinuity', packet.clock);
          blockedClock = true;
        } else await boundary(input.reason, input.activeTimeUs);
        if (input.reason === 'stop') {
          sourceStopped = true;
          signalStop();
        }
        if (
          input.reason === 'pause' ||
          input.reason === 'observation' ||
          input.reason === 'visibility'
        )
          releasedUps.clear();
      } else {
        let fromSeq: number | null = null;
        let toSeq: number | null = null;
        if (input.firstLostLocalSequence !== null && input.lastLostLocalSequence !== null) {
          if (input.firstLostLocalSequence !== lastLocalSequence + 1)
            throw new Error('CURSOR_TRAJECTORY_SOURCE_SEQUENCE');
          fromSeq = observationSeq;
          observationSeq += input.lastLostLocalSequence - input.firstLostLocalSequence + 1;
          if (!isTrajectoryInteger(observationSeq))
            throw new Error('CURSOR_TRAJECTORY_INTEGER_RANGE');
          toSeq = observationSeq - 1;
          lastLocalSequence = input.lastLostLocalSequence;
        } else unknownLocalGap = true;
        await gap(
          Math.max(lastTime, input.fromTimeUs),
          input.toTimeUs === null ? null : Math.max(lastTime, input.toTimeUs),
          input.reason,
          packet.clock,
          fromSeq,
          toSeq
        );
      }
    }
    lastBatchSequence = packet.batchSequence;
    lastBatchDigest = digest;
  };

  const intake = createRecordingHistoryIntake<
    RecordingCursorObservationPacket,
    CursorTrajectoryDescriptor
  >({
    recordingId,
    errorPrefix: 'CURSOR_TRAJECTORY',
    isPacket: isRecordingCursorObservationPacket,
    process,
  });

  return {
    append: intake.append,
    finish(
      options: { waitForSourceStop?: boolean; stoppedWhilePaused?: boolean } = {}
    ): Promise<CursorTrajectoryDescriptor> {
      return intake.finalize(async () => {
        if (options.waitForSourceStop && !sourceStopped && !intake.failed) {
          await waitForRecordingHistoryStop(stopped);
        }
        await intake.closeAndDrain();
        const confirmedPauseStop =
          options.stoppedWhilePaused && lastBoundary === 'pause' && active === null;
        if (!intake.failed) {
          try {
            if (!sourceStopped && !confirmedPauseStop && active)
              await gap(lastTime, null, 'source-unavailable', active.clock);
            else await flush();
            for (const block of packer.finish()) await store.append(writer, block);
          } catch {
            intake.fail();
          }
        }
        const head = await store.getHead(identity);
        if (!head) throw new Error('CURSOR_TRAJECTORY_STORAGE_UNAVAILABLE');
        const state =
          hadGap || intake.failed || (!sourceStopped && !confirmedPauseStop)
            ? head.totalBlocks === 0
              ? 'unavailable'
              : 'incomplete'
            : 'complete';
        const expected = {
          totalBlocks: head.totalBlocks,
          totalRecords: head.totalRecords,
          totalSamples: head.totalSamples,
          totalBytes: head.totalBytes,
          streamSha256: head.streamSha256,
        };
        return descriptor(await store.finalize(writer, expected, state));
      });
    },
    async discard(): Promise<void> {
      await intake.closeAndDrain();
      await store.retire(identity, writer.writerGeneration);
    },
  };
}
