import type { browserRuntime } from '@sniptale/platform/browser/runtime';
import { parseRuntimeRequestMessage } from '../../../../contracts/messaging/parsers/boundary';
import type { Logger } from '@sniptale/platform/observability/logger/types';
import type { RuntimeMessagingTransport } from '../../../../platform/runtime-messaging/transport';
import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import type { DesktopMediaSourceChooserResult } from './desktop-source';
import { DesktopMediaAcquisitionError } from './desktop-media.errors';
import {
  createDesktopMediaRequestBinding,
  isDesktopMediaSelectionForRequest,
  type DesktopMediaRequestBinding,
  type DesktopMediaSelectionMessage,
} from './desktop-media.request-binding';
import { runRequestWorkflow } from './request-workflow';

type DesktopMediaWorkflowResult =
  | { status: 'obtained'; label: string }
  | { status: 'cancelled' }
  | {
      status: 'failed';
      error: string;
      phase: 'desktop-stream-acquire' | 'display-media-acquire';
      sourceCount?: number;
      sourceIndex?: number;
    };

type FinishDesktopMediaWorkflow = (result: DesktopMediaWorkflowResult) => void;
type VideoManagerUiLogger = Pick<Logger, 'debug' | 'log' | 'warn'>;
type MessageSubscription = typeof browserRuntime.subscribeToMessages;

export type DesktopMediaRequestDeps = {
  chooseDesktopMediaSource?: (captureMode: CaptureMode) => Promise<DesktopMediaSourceChooserResult>;
  isTrustedOffscreenRuntimeSender: (sender: chrome.runtime.MessageSender) => boolean;
  logger: VideoManagerUiLogger;
  sendRuntimeMessage: RuntimeMessagingTransport['sendRuntimeMessage'];
  subscribeToMessages: MessageSubscription;
};

export type DesktopMediaRequestOptions = {
  controlledCursorCaptureEnabled?: boolean;
  desktopLabel?: string;
  desktopStreamId?: string;
  beforeDesktopStreamAcquire?: () => Promise<void>;
  sourceCount?: number;
  sourceIndex?: number;
};

function parseDesktopMediaSelectionMessage(message: unknown): DesktopMediaSelectionMessage | null {
  try {
    const parsedMessage = parseRuntimeRequestMessage(message);
    if (
      parsedMessage.type === VideoMessageType.DESKTOP_MEDIA_OBTAINED ||
      parsedMessage.type === VideoMessageType.DESKTOP_MEDIA_CANCELLED ||
      parsedMessage.type === VideoMessageType.DESKTOP_MEDIA_FAILED
    ) {
      return parsedMessage;
    }
  } catch {
    return null;
  }

  return null;
}

function finishDesktopMediaSelectionMessage(
  parsedMessage: DesktopMediaSelectionMessage,
  deps: DesktopMediaRequestDeps,
  finish: FinishDesktopMediaWorkflow
): void {
  if (parsedMessage.type === VideoMessageType.DESKTOP_MEDIA_OBTAINED) {
    deps.logger.debug('Desktop media obtained', parsedMessage.label);
    finish({ status: 'obtained', label: parsedMessage.label });
    return;
  }

  if (parsedMessage.type === VideoMessageType.DESKTOP_MEDIA_FAILED) {
    deps.logger.warn('[VideoManager] Desktop media acquisition failed:', parsedMessage);
    finish({
      status: 'failed',
      error: parsedMessage.error,
      phase: parsedMessage.phase,
      ...(parsedMessage.sourceCount === undefined
        ? {}
        : { sourceCount: parsedMessage.sourceCount }),
      ...(parsedMessage.sourceIndex === undefined
        ? {}
        : { sourceIndex: parsedMessage.sourceIndex }),
    });
    return;
  }

  deps.logger.debug('Desktop media selection cancelled');
  finish({ status: 'cancelled' });
}

function createDesktopMediaWorkflowListener(
  binding: DesktopMediaRequestBinding,
  deps: DesktopMediaRequestDeps
) {
  return (finish: FinishDesktopMediaWorkflow) =>
    (message: unknown, sender: chrome.runtime.MessageSender) => {
      if (!deps.isTrustedOffscreenRuntimeSender(sender)) {
        return;
      }

      const parsedMessage = parseDesktopMediaSelectionMessage(message);
      if (!parsedMessage || !isDesktopMediaSelectionForRequest(parsedMessage, binding)) {
        return;
      }

      finishDesktopMediaSelectionMessage(parsedMessage, deps, finish);
    };
}

function sendGetDesktopMediaRequest(
  captureMode: CaptureMode,
  options: DesktopMediaRequestOptions,
  binding: DesktopMediaRequestBinding,
  deps: DesktopMediaRequestDeps
) {
  return deps.sendRuntimeMessage(
    attachOffscreenCommandCapability({
      type: VideoMessageType.GET_DESKTOP_MEDIA,
      captureMode,
      desktopMediaRequestGeneration: binding.desktopMediaRequestGeneration,
      desktopMediaRequestId: binding.desktopMediaRequestId,
      ...(options.controlledCursorCaptureEnabled === undefined
        ? {}
        : { controlledCursorCaptureEnabled: options.controlledCursorCaptureEnabled }),
      ...(options.desktopStreamId === undefined
        ? {}
        : { desktopStreamId: options.desktopStreamId }),
      ...(options.desktopLabel === undefined ? {} : { desktopLabel: options.desktopLabel }),
      ...(options.sourceCount === undefined ? {} : { sourceCount: options.sourceCount }),
      ...(options.sourceIndex === undefined ? {} : { sourceIndex: options.sourceIndex }),
    })
  );
}

function createAcquireFailureResult(
  error: unknown,
  options: DesktopMediaRequestOptions
): DesktopMediaWorkflowResult {
  return {
    status: 'failed',
    error: error instanceof Error ? error.message : String(error),
    phase:
      options.desktopStreamId === undefined ? 'display-media-acquire' : 'desktop-stream-acquire',
    ...(options.sourceCount === undefined ? {} : { sourceCount: options.sourceCount }),
    ...(options.sourceIndex === undefined ? {} : { sourceIndex: options.sourceIndex }),
  };
}

export function runDesktopMediaRequestWorkflow(
  captureMode: CaptureMode,
  options: DesktopMediaRequestOptions,
  deps: DesktopMediaRequestDeps
): Promise<DesktopMediaWorkflowResult> {
  const failOnRequestError =
    options.desktopStreamId !== undefined || (options.sourceCount ?? 1) > 1;
  const requestBinding = createDesktopMediaRequestBinding(options);

  return runRequestWorkflow({
    createListener: createDesktopMediaWorkflowListener(requestBinding, deps),
    onRequestError: (error, finish) => {
      deps.logger.warn('[VideoManager] Desktop media request failed:', error);
      finish(
        failOnRequestError ? createAcquireFailureResult(error, options) : { status: 'cancelled' }
      );
    },
    onTimeout: (finish) => {
      deps.logger.warn('[VideoManager] Desktop media selection timeout');
      finish(
        failOnRequestError
          ? createAcquireFailureResult('Desktop media acquisition timed out', options)
          : { status: 'cancelled' }
      );
    },
    request: () => sendGetDesktopMediaRequest(captureMode, options, requestBinding, deps),
    subscribeToMessages: deps.subscribeToMessages,
    timeoutMs: 60000,
  });
}

export function resolveDesktopMediaRequestResult(
  result: DesktopMediaWorkflowResult
): { label: string } | null {
  if (result.status === 'obtained') {
    return { label: result.label };
  }

  return null;
}

export function resolveDesktopMediaSourceRequestResult(
  result: DesktopMediaWorkflowResult
): { label: string } | null {
  switch (result.status) {
    case 'obtained':
      return { label: result.label };
    case 'cancelled':
      return null;
    case 'failed':
      throw new DesktopMediaAcquisitionError(result.error, {
        phase: result.phase,
        ...(result.sourceCount === undefined ? {} : { sourceCount: result.sourceCount }),
        ...(result.sourceIndex === undefined ? {} : { sourceIndex: result.sourceIndex }),
      });
  }
}
