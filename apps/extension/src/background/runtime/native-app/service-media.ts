import type {
  NativeAppInboundMessage,
  NativeAppOutboundMessage,
} from '../../../contracts/native-app';
import type { NativeAppIngestionController } from '../../capture/native-app/controller';

export type NativeMediaMessage = Extract<
  NativeAppInboundMessage,
  {
    type:
      | 'app.screenshot.start'
      | 'app.screenshot.chunk'
      | 'app.screenshot.commit'
      | 'app.recording.stopped'
      | 'app.recording.chunk'
      | 'app.recording.attachment.manifest'
      | 'app.recording.attachment.chunk'
      | 'app.recording.attachment.available'
      | 'app.recording.events.manifest'
      | 'app.recording.events.chunk'
      | 'app.recording.events.available';
  }
>;

export function dispatchNativeMediaMessage(args: {
  hasGrantedLease: (message: { controllerLeaseId: string }) => boolean;
  ingestion: NativeAppIngestionController;
  message: NativeMediaMessage;
  postResponses: (
    responses: NativeAppOutboundMessage[] | Promise<NativeAppOutboundMessage[]>
  ) => void;
  warn: (message: string) => void;
}): void {
  const { hasGrantedLease, ingestion, message, postResponses, warn } = args;
  if (!hasGrantedLease(message)) {
    warn(`Rejected stale native ${message.type}`);
    return;
  }

  switch (message.type) {
    case 'app.recording.attachment.manifest':
    case 'app.recording.attachment.chunk':
    case 'app.recording.attachment.available':
    case 'app.recording.events.manifest':
    case 'app.recording.events.chunk':
    case 'app.recording.events.available':
      postResponses(ingestion.handleHistory(message));
      return;
    case 'app.screenshot.start':
      postResponses(ingestion.handleScreenshotStart(message));
      return;
    case 'app.screenshot.chunk':
      postResponses(ingestion.handleScreenshotChunk(message));
      return;
    case 'app.screenshot.commit':
      postResponses(ingestion.handleScreenshotCommit(message));
      return;
    case 'app.recording.stopped':
      postResponses(ingestion.handleRecordingStopped(message));
      return;
    case 'app.recording.chunk':
      postResponses(ingestion.handleRecordingChunk(message));
      return;
  }
}
