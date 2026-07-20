import { runBestEffort } from '@sniptale/foundation/best-effort';
import type { Logger } from '@sniptale/platform/observability/logger/types';
import { getContentRuntimeServices } from '../../application/runtime-services/services';
import { stageRecordingDownload, type RecordingDownloadSendMessage } from './staged-transfer';

type ScheduleTimeout = (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;

interface RecordingDownloadPayload {
  filename: string;
  size: number;
}

interface RecordingDownloadWorkflowOptions {
  buildFilename: (now: Date) => string;
  logger: Logger;
  logChunkCount?: (count: number) => void;
  logCleanup?: () => void;
  logPreparedPayload?: (payload: RecordingDownloadPayload) => void;
  onChunksReset?: () => void;
  recordedChunks: Blob[];
  schedule?: ScheduleTimeout;
  sendMessage?: RecordingDownloadSendMessage;
  stopMessageFailure: string;
}

type RecordingWorkflowPropOptions = {
  onChunksReset?: (() => void) | undefined;
  recordedChunks: Blob[];
  schedule?: ScheduleTimeout | undefined;
  sendMessage?: RecordingDownloadSendMessage | undefined;
};

type RecordingWorkflowLogOptions = Pick<
  RecordingDownloadWorkflowOptions,
  'logChunkCount' | 'logCleanup' | 'logPreparedPayload'
>;

type RecordingSaveProps = {
  onChunksReset?: (() => void) | undefined;
  recordedChunks: Blob[];
  schedule?: ScheduleTimeout | undefined;
  sendMessage?: RecordingDownloadSendMessage | undefined;
};

type LoggerMethod = 'debug' | 'log';

type RecordingLoggerOptions = {
  chunkCountMessage: string;
  cleanupMessage: string;
  method: LoggerMethod;
  preparedPayloadMessage: string;
};

export function buildTimestampedRecordingFilename(prefix: string, now: Date): string {
  const [date = now.toISOString()] = now.toISOString().split('T');
  const [timeSegment = now.toTimeString()] = now.toTimeString().split(' ');
  const time = timeSegment.replace(/:/g, '-');
  return `${prefix}_${date}_${time}.webm`;
}

function createTimestampedRecordingFilenameBuilder(prefix: string) {
  return (now: Date): string => buildTimestampedRecordingFilename(prefix, now);
}

function createRecordingLoggerOptions(args: {
  logger: Logger;
  options: RecordingLoggerOptions;
}): RecordingWorkflowLogOptions {
  const log = args.logger[args.options.method].bind(args.logger);

  return {
    logChunkCount: (count) => {
      log(args.options.chunkCountMessage, count);
    },
    logCleanup: () => {
      log(args.options.cleanupMessage);
    },
    logPreparedPayload: (payload) => {
      log(args.options.preparedPayloadMessage, payload);
    },
  };
}

export function createContentRecordingSaveArtifacts(args: {
  filenamePrefix: string;
  logger: Logger;
  loggerOptions: RecordingLoggerOptions;
  stopMessageFailure: string;
}) {
  const buildFilename = createTimestampedRecordingFilenameBuilder(args.filenamePrefix);

  return {
    buildFilename,
    saveRecording: createRecordingSaveHandler({
      buildFilename,
      logger: args.logger,
      logOptions: createRecordingLoggerOptions({
        logger: args.logger,
        options: args.loggerOptions,
      }),
      stopMessageFailure: args.stopMessageFailure,
    }),
  };
}

export function buildRecordingDownloadWorkflowOptions(args: {
  buildFilename: RecordingDownloadWorkflowOptions['buildFilename'];
  logger: RecordingDownloadWorkflowOptions['logger'];
  logOptions?: RecordingWorkflowLogOptions;
  props: RecordingWorkflowPropOptions;
  stopMessageFailure: string;
}): RecordingDownloadWorkflowOptions {
  return {
    buildFilename: args.buildFilename,
    logger: args.logger,
    recordedChunks: args.props.recordedChunks,
    stopMessageFailure: args.stopMessageFailure,
    ...(args.logOptions?.logChunkCount === undefined
      ? {}
      : { logChunkCount: args.logOptions.logChunkCount }),
    ...(args.logOptions?.logCleanup === undefined
      ? {}
      : { logCleanup: args.logOptions.logCleanup }),
    ...(args.logOptions?.logPreparedPayload === undefined
      ? {}
      : { logPreparedPayload: args.logOptions.logPreparedPayload }),
    ...(args.props.onChunksReset === undefined ? {} : { onChunksReset: args.props.onChunksReset }),
    ...(args.props.schedule === undefined ? {} : { schedule: args.props.schedule }),
    ...(args.props.sendMessage === undefined ? {} : { sendMessage: args.props.sendMessage }),
  };
}

export function createRecordingSaveHandler(args: {
  buildFilename: RecordingDownloadWorkflowOptions['buildFilename'];
  logger: RecordingDownloadWorkflowOptions['logger'];
  logOptions?: RecordingWorkflowLogOptions;
  stopMessageFailure: string;
}): (props: RecordingSaveProps) => boolean {
  return (props) => {
    const options = buildRecordingDownloadWorkflowOptions({
      buildFilename: args.buildFilename,
      logger: args.logger,
      ...(args.logOptions === undefined ? {} : { logOptions: args.logOptions }),
      props,
      stopMessageFailure: args.stopMessageFailure,
    });
    return runRecordingDownloadWorkflow(options);
  };
}

function runRecordingDownloadWorkflow(options: RecordingDownloadWorkflowOptions): boolean {
  options.logger.log('Saving recording');
  options.logChunkCount?.(options.recordedChunks.length);

  if (options.recordedChunks.length === 0) {
    options.logger.warn('No chunks to save');
    return false;
  }

  const sendMessage = options.sendMessage ?? sendDefaultRecordingDownloadMessage;
  const schedule = options.schedule ?? ((callback, delay) => setTimeout(callback, delay));
  const blob = new Blob(options.recordedChunks, { type: 'video/webm' });
  const filename = options.buildFilename(new Date());

  options.logPreparedPayload?.({ filename, size: blob.size });

  if (blob.size <= 0) {
    options.logger.warn('No recording bytes to save');
    return false;
  }

  void stageRecordingDownload({
    blob,
    filename,
    logger: options.logger,
    sendMessage,
  })
    .then(() => {
      options.logger.log('Download started');
    })
    .catch((error) => {
      options.logger.error('Download failed', error);
    });

  runBestEffort(
    sendMessage({ type: 'REGION_CAPTURE_STOPPED' }),
    options.logger,
    options.stopMessageFailure
  );

  schedule(() => {
    options.onChunksReset?.();
    options.logCleanup?.();
  }, 30000);

  return true;
}

async function sendDefaultRecordingDownloadMessage(
  message: Parameters<RecordingDownloadSendMessage>[0]
): ReturnType<RecordingDownloadSendMessage> {
  return (await getContentRuntimeServices().messaging.sendRuntimeMessage(message)) ?? {};
}
