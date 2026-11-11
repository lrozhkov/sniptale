import { createLogger } from '@sniptale/platform/observability/logger';
import type { AIConnectionReason } from '../../contracts/settings/ai-catalog';
import { browserRuntime } from '@sniptale/platform/browser/runtime';
import {
  IMAGE_JOB_PORT_NAME,
  IMAGE_JOB_FAILURE_CODES,
  IMAGE_JOB_KEEPALIVE_MS,
  IMAGE_JOB_TIMEOUT_MS,
  parseImageJobServerMessage,
  type ImageJobStart,
  type ImageJobFailureCode,
  type ImageJobServerMessage,
} from '../../contracts/ai/image';
import { createImageEditorEgressAuthority } from '../../features/ai/egress-authority';
import { requestLlmSessionToken } from '../../workflows/ai-session/llm-session';

const logger = createLogger({ namespace: 'ImageEditorJob' });

export interface ImageJobDiagnostic {
  phase: 'approval' | 'authorizing' | 'requesting' | 'receiving' | 'response';
  code: ImageJobFailureCode;
  reason?: AIConnectionReason;
  approvalReason?:
    | 'sender-rejected'
    | 'token-unavailable'
    | 'secret-locked'
    | 'session-unavailable';
}

/** Carries only fixed failure metadata across the local editor boundary. */
export class ImageJobError extends Error {
  constructor(readonly diagnostic: ImageJobDiagnostic) {
    super(diagnostic.code);
  }
}

function imageApprovalFailure(error: unknown): ImageJobDiagnostic {
  const message = error instanceof Error ? error.message : '';
  const approvalReason =
    message === 'Unauthorized LLM session sender'
      ? 'sender-rejected'
      : message === 'Unable to issue LLM session token'
        ? 'token-unavailable'
        : message === 'AI provider secrets are locked' ||
            message === 'Unable to start AI request session after unlock'
          ? 'secret-locked'
          : 'session-unavailable';
  return {
    code: 'unauthorized',
    phase: 'approval',
    approvalReason,
  };
}

function imageJobFailure(error: Error, phase: ImageJobDiagnostic['phase']): ImageJobError {
  if (error instanceof ImageJobError) return error;
  const code = IMAGE_JOB_FAILURE_CODES.find((code) => code === error.message) ?? 'interrupted';
  return new ImageJobError({ code, phase });
}

/** Approves one immutable payload and owns its parsed Port until completion, cancellation or failure. */
export async function runImageEditorJob(options: {
  request: Omit<ImageJobStart, 'llmSessionToken'>;
  signal: AbortSignal;
  receive(message: ImageJobServerMessage): void;
}): Promise<void> {
  const { request, signal } = options;
  signal.throwIfAborted();
  const authority = await createImageEditorEgressAuthority(request);
  signal.throwIfAborted();
  let llmSessionToken: string;
  try {
    llmSessionToken = await requestLlmSessionToken('image-editor', authority);
  } catch (error) {
    signal.throwIfAborted();
    const diagnostic = imageApprovalFailure(error);
    logger.warn('Image request approval failed', { requestId: request.requestId, ...diagnostic });
    throw new ImageJobError(diagnostic);
  }
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const port = browserRuntime.connect({ name: IMAGE_JOB_PORT_NAME });
    const received = new Set<number>();
    let done = false;
    let phase: ImageJobDiagnostic['phase'] = 'authorizing';
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      clearInterval(keepalive);
      signal.removeEventListener('abort', cancel);
      port.onMessage.removeListener(onMessage);
      port.onDisconnect.removeListener(onDisconnect);
      port.disconnect();
      if (error) {
        const failure = imageJobFailure(error, phase);
        logger.warn('Image request failed', {
          requestId: request.requestId,
          ...failure.diagnostic,
        });
        reject(failure);
      } else resolve();
    };
    const cancel = () => {
      try {
        port.postMessage({ type: 'cancel', requestId: request.requestId });
      } catch {
        /* Disconnect also cancels the background owner. */
      }
      finish(new Error('cancelled'));
    };
    const onDisconnect = () => {
      void browserRuntime.getLastError();
      finish(new Error('interrupted'));
    };
    const onMessage = (value: unknown) => {
      const message = parseImageJobServerMessage(value);
      if (!message) {
        finish(new Error('invalid-response'));
        return;
      }
      if (message.requestId !== request.requestId) return;
      if (message.type === 'progress') phase = message.phase;
      if (message.type === 'image') {
        phase = 'response';
        if (
          received.has(message.variant) ||
          message.variant >= request.context.parameters.variants
        ) {
          finish(new Error('invalid-response'));
          return;
        }
        received.add(message.variant);
      }
      try {
        options.receive(message);
      } catch {
        finish(new Error('too-large'));
        return;
      }
      if (message.type === 'failure')
        finish(
          new ImageJobError({
            code: message.code,
            phase,
            ...(message.failureReason ? { reason: message.failureReason } : {}),
          })
        );
      if (message.type === 'complete')
        finish(
          received.size === message.received &&
            message.received === request.context.parameters.variants
            ? undefined
            : new Error('invalid-response')
        );
    };
    const timeout = setTimeout(() => finish(new Error('timeout')), IMAGE_JOB_TIMEOUT_MS + 10_000);
    const keepalive = setInterval(() => {
      try {
        port.postMessage({ type: 'keepalive', requestId: request.requestId });
      } catch {
        finish(new Error('interrupted'));
      }
    }, IMAGE_JOB_KEEPALIVE_MS);
    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(onDisconnect);
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) {
      cancel();
      return;
    }
    try {
      port.postMessage({ ...request, llmSessionToken });
    } catch {
      finish(new Error('interrupted'));
    }
  });
}
