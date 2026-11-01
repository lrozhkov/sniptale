import { initDB } from '../../../composition/persistence/infrastructure/indexed-db/core';
import { createLogger } from '@sniptale/platform/observability/logger';
import type {
  NativeHistoryInboundMessage,
  NativeHistoryOutboundMessage,
} from '../../../contracts/native-app/attachment-message-types';
import { createNativeRecordingHistoryStore } from '../../../composition/persistence/recordings/native-history/store';
import { createRecordingCursorTrajectoryStore } from '../../../composition/persistence/recordings/cursor-trajectory/store';
import { createRecordingEventsStore } from '../../../composition/persistence/recordings/recording-events/store';
import { readPublishedNativeHistory } from '../../../composition/persistence/recordings/native-history/publication';
import { saveNativeRecordingHistory } from '../../../composition/persistence/recordings/telemetry';
import { openVideoEditorPage } from '../../../platform/navigation/extension-pages';
import { createNativeRecordingHistoryPuller, type NativeHistoryPullResult } from './history-pull';
import { getNativeTransferSession } from './persistence/staging';
import { mapNativeRecordingTelemetry } from './telemetry';

const logger = createLogger({ namespace: 'NativeRecordingHistoryIngestion' });
interface HistoryIngestionDependencies {
  currentLeaseId(): string | null;
  enabled(kind: 'cursor' | 'events'): boolean;
}
/** The recording controller serializes this owner with video work for the same source. */
export function createNativeRecordingHistoryIngestion(deps: HistoryIngestionDependencies) {
  const intents = createNativeRecordingHistoryStore();
  const puller = createNativeRecordingHistoryPuller({
    intents,
    currentLeaseId: deps.currentLeaseId,
    mintRequestId: () => crypto.randomUUID(),
    cursor: (writerGeneration) =>
      createRecordingCursorTrajectoryStore({
        database: initDB,
        mintGeneration: () => writerGeneration,
      }),
    events: (writerGeneration) =>
      createRecordingEventsStore({ database: initDB, mintGeneration: () => writerGeneration }),
  });
  const owns = (lease: string) =>
    (deps.enabled('cursor') || deps.enabled('events')) && deps.currentLeaseId() === lease;
  async function prepare(
    recordingId: string,
    lease: string,
    incoming?: NativeHistoryInboundMessage
  ) {
    if (!owns(lease)) return null;
    let parent = await getNativeTransferSession(recordingId);
    if (!owns(lease) || parent?.kind !== 'recording-complete') return null;
    if (parent.controllerLeaseId !== lease) {
      if (
        !incoming ||
        (incoming.type !== 'app.recording.attachment.available' &&
          incoming.type !== 'app.recording.events.available') ||
        incoming.videoSha256 !== parent.sha256
      )
        return null;
      if (parent.metadata.history !== undefined) {
        await intents.rebind({
          recordingId,
          controllerLeaseId: lease,
          videoSha256: incoming.videoSha256,
        });
        if (!owns(lease)) return null;
        parent = await getNativeTransferSession(recordingId);
        if (parent?.kind !== 'recording-complete' || parent.controllerLeaseId !== lease)
          return null;
      }
    }
    const existing = await intents.read(recordingId);
    if (!owns(lease)) return null;
    const available =
      incoming &&
      (incoming.type === 'app.recording.attachment.available' ||
        incoming.type === 'app.recording.events.available')
        ? incoming
        : null;
    if (available && available.videoSha256 !== parent.sha256) return null;
    const cursorTrajectory = !deps.enabled('cursor')
      ? undefined
      : (existing?.cursor?.descriptor ??
        parent.metadata.cursorTrajectory ??
        (available?.type === 'app.recording.attachment.available'
          ? available.descriptor
          : undefined));
    const recordingEvents = !deps.enabled('events')
      ? undefined
      : (existing?.events?.descriptor ??
        parent.metadata.recordingEvents ??
        (available?.type === 'app.recording.events.available' ? available.descriptor : undefined));
    if (!cursorTrajectory && !recordingEvents) return null;
    const baseTelemetry = mapNativeRecordingTelemetry({
      createdAt: parent.createdAt,
      recordingId,
      sourceMode: parent.metadata.sourceMode ?? 'screen',
      telemetry: parent.metadata.telemetry ?? null,
      ...(parent.metadata.timebase ? { timebase: parent.metadata.timebase } : {}),
      updatedAt: parent.updatedAt,
    });
    const intent = await intents.plan(
      {
        recordingId,
        controllerLeaseId: lease,
        videoSha256: parent.sha256,
        width: parent.metadata.width,
        height: parent.metadata.height,
        ...(baseTelemetry ? { baseTelemetry } : {}),
        ...(cursorTrajectory ? { cursorTrajectory } : {}),
        ...(recordingEvents ? { recordingEvents } : {}),
      },
      parent.controllerLeaseId !== lease ? parent.controllerLeaseId : undefined
    );
    return owns(lease) ? { parent, intent } : null;
  }
  async function publishReady(
    recordingId: string,
    lease: string,
    result: NativeHistoryPullResult
  ): Promise<NativeHistoryOutboundMessage[]> {
    const responses: NativeHistoryOutboundMessage[] = [...result.messages];
    for (const kind of result.ready) {
      try {
        if (!owns(lease)) return [];
        const before = await intents.read(recordingId);
        await saveNativeRecordingHistory(recordingId, kind);
        if (!owns(lease)) return [];
        const receipt = await readPublishedNativeHistory(recordingId, kind);
        if (!owns(lease)) return [];
        const identity = {
          protocolVersion: 2 as const,
          controllerLeaseId: lease,
          recordingId,
          requestId: crypto.randomUUID(),
        };
        if (receipt?.kind === 'cursor') {
          const d = receipt.descriptor;
          responses.push({
            ...identity,
            type: 'extension.recording.attachment.ack',
            trajectoryId: d.trajectoryId,
            receipt: {
              version: 1,
              durable: true,
              format: d.format,
              state: d.state,
              totalBlocks: d.totalBlocks,
              totalRecords: d.totalRecords,
              totalSamples: d.totalSamples,
              totalBytes: d.totalBytes,
              streamSha256: d.streamSha256,
            },
          });
        } else if (receipt?.kind === 'events') {
          const d = receipt.descriptor;
          responses.push({
            ...identity,
            type: 'extension.recording.events.ack',
            eventStreamId: d.eventStreamId,
            receipt: {
              version: 1,
              durable: true,
              format: d.format,
              state: d.state,
              totalBlocks: d.totalBlocks,
              totalRecords: d.totalRecords,
              totalBytes: d.totalBytes,
              streamSha256: d.streamSha256,
            },
          });
        }
        const after = await intents.read(recordingId);
        if (before?.phase === 'pending' && after?.phase === 'complete' && owns(lease)) {
          const parent = await getNativeTransferSession(recordingId);
          if (parent?.metadata.openEditor && owns(lease))
            await openVideoEditorPage(null, recordingId).catch(() => undefined);
        }
      } catch {
        logger.warn('Native history publication remains pending', { kind });
      }
    }
    return owns(lease) ? responses : [];
  }
  return {
    async resume(
      recordingId: string,
      lease: string,
      includePublished = false
    ): Promise<NativeHistoryOutboundMessage[]> {
      const prepared = await prepare(recordingId, lease);
      if (!prepared || (!includePublished && prepared.intent.phase === 'complete')) return [];
      const responses: NativeHistoryOutboundMessage[] = [];
      for (const kind of ['cursor', 'events'] as const) {
        const slot = kind === 'cursor' ? prepared.intent.cursor : prepared.intent.events;
        if (!deps.enabled(kind) || !slot || (!includePublished && slot.pull?.kind === 'published'))
          continue;
        try {
          responses.push(
            ...(await publishReady(recordingId, lease, await puller.start(recordingId, kind)))
          );
        } catch {
          logger.warn('Native history transfer remains pending', { kind });
        }
      }
      return owns(lease) ? responses : [];
    },
    async handle(message: NativeHistoryInboundMessage): Promise<NativeHistoryOutboundMessage[]> {
      if (!deps.enabled(message.type.startsWith('app.recording.attachment.') ? 'cursor' : 'events'))
        return [];
      if (!(await prepare(message.recordingId, message.controllerLeaseId, message))) return [];
      try {
        return await publishReady(
          message.recordingId,
          message.controllerLeaseId,
          await puller.handle(message)
        );
      } catch {
        logger.warn('Native history message was not accepted');
        return [];
      }
    },
  };
}
