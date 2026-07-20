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
      | 'app.recording.chunk';
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
