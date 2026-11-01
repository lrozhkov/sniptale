import type {
  CursorTrajectoryDescriptor,
  CursorTrajectoryManifestEntry,
} from '../../features/video/project/cursor-trajectory/types';
import type {
  RecordingEventsDescriptor,
  RecordingEventsManifestEntry,
} from '../../features/video/project/recording-events/types';

interface AttachmentIdentity {
  protocolVersion: 2;
  controllerLeaseId: string;
  recordingId: string;
}
type CursorIdentity = AttachmentIdentity & { trajectoryId: string };
type EventsIdentity = AttachmentIdentity & { eventStreamId: string };
interface ManifestPage<Descriptor, Entry> {
  requestId: string;
  descriptor: Descriptor;
  fromSequence: number;
  entries: Entry[];
  nextSequence: number | null;
}
interface AttachmentChunk {
  requestId: string;
  sequence: number;
  blockBytes: number;
  blockSha256: string;
  chunkIndex: number;
  chunkCount: number;
  chunkByteOffset: number;
  chunkRawBytes: number;
  chunkSha256: string;
  base64: string;
}
interface ManifestRequest {
  requestId: string;
  nextSequence: number;
  prefixSha256: string;
}
interface ChunkRequest {
  requestId: string;
  sequence: number;
  chunkIndex: number;
}
type DurableCursorReceipt = { version: 1; durable: true } & Pick<
  CursorTrajectoryDescriptor,
  | 'format'
  | 'state'
  | 'totalBlocks'
  | 'totalRecords'
  | 'totalSamples'
  | 'totalBytes'
  | 'streamSha256'
>;
type DurableEventsReceipt = { version: 1; durable: true } & Pick<
  RecordingEventsDescriptor,
  'format' | 'state' | 'totalBlocks' | 'totalRecords' | 'totalBytes' | 'streamSha256'
>;

export type AppRecordingAttachmentManifestMessage = CursorIdentity & {
  type: 'app.recording.attachment.manifest';
} & ManifestPage<CursorTrajectoryDescriptor, CursorTrajectoryManifestEntry>;
export type AppRecordingAttachmentChunkMessage = CursorIdentity & {
  type: 'app.recording.attachment.chunk';
} & AttachmentChunk;
export type AppRecordingAttachmentAvailableMessage = CursorIdentity & {
  type: 'app.recording.attachment.available';
  videoSha256: string;
  descriptor: CursorTrajectoryDescriptor;
};
export type AppRecordingEventsManifestMessage = EventsIdentity & {
  type: 'app.recording.events.manifest';
} & ManifestPage<RecordingEventsDescriptor, RecordingEventsManifestEntry>;
export type AppRecordingEventsChunkMessage = EventsIdentity & {
  type: 'app.recording.events.chunk';
} & AttachmentChunk;
export type AppRecordingEventsAvailableMessage = EventsIdentity & {
  type: 'app.recording.events.available';
  videoSha256: string;
  descriptor: RecordingEventsDescriptor;
};

export type NativeHistoryInboundMessage =
  | AppRecordingAttachmentManifestMessage
  | AppRecordingAttachmentChunkMessage
  | AppRecordingAttachmentAvailableMessage
  | AppRecordingEventsManifestMessage
  | AppRecordingEventsChunkMessage
  | AppRecordingEventsAvailableMessage;

export type NativeHistoryOutboundMessage =
  | (CursorIdentity & { type: 'extension.recording.attachment.manifest.request' } & ManifestRequest)
  | (CursorIdentity & { type: 'extension.recording.attachment.chunk.request' } & ChunkRequest)
  | (CursorIdentity & {
      type: 'extension.recording.attachment.ack';
      requestId: string;
      receipt: DurableCursorReceipt;
    })
  | (EventsIdentity & { type: 'extension.recording.events.manifest.request' } & ManifestRequest)
  | (EventsIdentity & { type: 'extension.recording.events.chunk.request' } & ChunkRequest)
  | (EventsIdentity & {
      type: 'extension.recording.events.ack';
      requestId: string;
      receipt: DurableEventsReceipt;
    });
