import { cancelReviewRemoteJob, keepReviewRemoteJobAlive } from './remote-job-port';
import { browserRuntime } from '@sniptale/platform/browser/runtime';
import {
  AUDIO_JOB_PORT_NAME,
  AUDIO_JOB_TIMEOUT_MS,
  AUDIO_JOB_KEEPALIVE_MS,
  parseAudioJobServerMessage,
  sameAudioJobScope,
  type AudioJobStart,
  type AudioTranscriptResult,
  type AudioStagedHandle,
} from '../../contracts/ai/audio';
import {
  writeAudioStaging,
  discardAudioStaging,
} from '../../composition/persistence/assets/audio-staging';

type ReviewSpeechJobResult =
  | { type: 'transcript'; result: AudioTranscriptResult }
  | { type: 'audio'; staged: AudioStagedHandle };

/** One connection owns one explicit paid operation. Disconnect never retries it. */
export function runReviewSpeechJob(
  start: AudioJobStart,
  options: {
    signal: AbortSignal;
    /** Null means the authorized interval was decoded as confirmed digital silence. */
    prepareInput?: (signal: AbortSignal) => Promise<Blob | null>;
  }
): Promise<ReviewSpeechJobResult> {
  options.signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const port = browserRuntime.connect({ name: AUDIO_JOB_PORT_NAME });
    const controller = new AbortController();
    let finished = false;
    let authorized = false;
    const finish = (result?: ReviewSpeechJobResult, error?: Error) => {
      if (finished) return;
      finished = true;
      controller.abort();
      clearTimeout(timer);
      clearInterval(keepalive);
      options.signal.removeEventListener('abort', cancel);
      port.disconnect();
      if (result) resolve(result);
      else reject(error ?? new Error('interrupted'));
    };
    const cancel = () => cancelReviewRemoteJob(port, start.requestId, finish);
    const timer = setTimeout(() => finish(undefined, new Error('timeout')), AUDIO_JOB_TIMEOUT_MS);
    const keepalive = setInterval(() => {
      if (finished) return;
      keepReviewRemoteJobAlive(port, start.requestId, finish);
    }, AUDIO_JOB_KEEPALIVE_MS);
    options.signal.addEventListener('abort', cancel, { once: true });
    port.onDisconnect.addListener(() => {
      void browserRuntime.getLastError();
      finish();
    });
    port.onMessage.addListener((value: unknown) => {
      const message = parseAudioJobServerMessage(value);
      if (!message) {
        finish(undefined, new Error('invalid-response'));
        return;
      }
      if (finished || message.requestId !== start.requestId) return;
      if (message.type === 'failure') finish(undefined, new Error(message.code));
      else if (message.type === 'transcript' || message.type === 'audio') {
        if ((message.type === 'transcript') !== (start.operation === 'transcription'))
          finish(undefined, new Error('invalid-response'));
        else finish(message);
      } else if (message.type === 'authorized') {
        if (
          authorized ||
          start.operation !== 'transcription' ||
          !options.prepareInput ||
          !sameAudioJobScope(start.scope, message.scope)
        ) {
          finish(undefined, new Error('invalid-response'));
          return;
        }
        authorized = true;
        void options
          .prepareInput(controller.signal)
          .catch(() => {
            throw new Error('decode-failed');
          })
          .then(async (blob) => {
            controller.signal.throwIfAborted();
            if (blob === null) {
              port.postMessage({ type: 'cancel', requestId: start.requestId });
              finish({ type: 'transcript', result: { text: '' } });
              return;
            }
            const staged = await writeAudioStaging({
              id: message.ticket,
              scope: start.scope,
              blob,
              signal: controller.signal,
            });
            try {
              controller.signal.throwIfAborted();
              port.postMessage({
                type: 'execute',
                requestId: start.requestId,
                ticket: message.ticket,
                staged,
              });
            } catch (error) {
              await discardAudioStaging(staged, start.scope).catch(() => undefined);
              throw error;
            }
          })
          .catch((error: unknown) =>
            finish(
              undefined,
              new Error(
                controller.signal.aborted
                  ? 'cancelled'
                  : error instanceof Error && error.message === 'decode-failed'
                    ? 'decode-failed'
                    : 'storage-failed'
              )
            )
          );
      }
    });
    try {
      port.postMessage(start);
    } catch {
      finish(undefined, new Error('interrupted'));
    }
  });
}
