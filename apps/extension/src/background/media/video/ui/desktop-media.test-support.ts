import { vi } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { DesktopMediaSourceChooserResult } from './desktop-source';
import type { requestDesktopMediaSource } from './desktop-media';

type RuntimeListener = (message: unknown, sender: chrome.runtime.MessageSender) => void;
type DesktopMediaRequestDeps = NonNullable<Parameters<typeof requestDesktopMediaSource>[2]>;
type SendRuntimeMessage = (message: unknown) => Promise<unknown>;
type DesktopMediaRequestBinding = {
  desktopMediaRequestGeneration: string;
  desktopMediaRequestId: string;
  sourceCount?: number;
  sourceIndex?: number;
};

export type RuntimeSubscriptionHarness = ReturnType<typeof createRuntimeSubscriptionHarness>;
export type SendRuntimeMessageMock = ReturnType<typeof vi.fn<SendRuntimeMessage>>;

export function createSendRuntimeMessageMock(): SendRuntimeMessageMock {
  const mock = vi.fn<SendRuntimeMessage>();
  return mock.mockResolvedValue(undefined);
}

export function createRuntimeSubscriptionHarness() {
  let listener: RuntimeListener | null = null;
  const unsubscribe = vi.fn();

  return {
    emit(
      message: unknown,
      sender: chrome.runtime.MessageSender = {} as chrome.runtime.MessageSender
    ) {
      listener?.(message, sender);
    },
    subscribeToMessages: vi.fn((nextListener: RuntimeListener) => {
      listener = nextListener;
      return unsubscribe;
    }),
    unsubscribe,
  };
}

export function createSelectedDesktopSource() {
  return {
    status: 'selected' as const,
    selection: {
      label: 'Window 2',
      streamId: 'desktop-2',
    },
  };
}

function readDesktopMediaRequestBinding(
  sendRuntimeMessage: SendRuntimeMessageMock
): DesktopMediaRequestBinding {
  const message = sendRuntimeMessage.mock.calls.at(-1)?.[0] as DesktopMediaRequestBinding;
  return {
    desktopMediaRequestGeneration: message.desktopMediaRequestGeneration,
    desktopMediaRequestId: message.desktopMediaRequestId,
    ...(message.sourceCount === undefined ? {} : { sourceCount: message.sourceCount }),
    ...(message.sourceIndex === undefined ? {} : { sourceIndex: message.sourceIndex }),
  };
}

export function createDesktopMediaObtainedMessage(
  sendRuntimeMessage: SendRuntimeMessageMock,
  label: string
) {
  return {
    type: VideoMessageType.DESKTOP_MEDIA_OBTAINED,
    ...readDesktopMediaRequestBinding(sendRuntimeMessage),
    label,
  };
}

export function createDesktopMediaFailedMessage(
  sendRuntimeMessage: SendRuntimeMessageMock,
  error: string,
  phase: 'desktop-stream-acquire' | 'display-media-acquire'
) {
  return {
    type: VideoMessageType.DESKTOP_MEDIA_FAILED,
    ...readDesktopMediaRequestBinding(sendRuntimeMessage),
    error,
    phase,
  };
}

export function createDesktopMediaCancelledMessage(sendRuntimeMessage: SendRuntimeMessageMock) {
  return {
    type: VideoMessageType.DESKTOP_MEDIA_CANCELLED,
    ...readDesktopMediaRequestBinding(sendRuntimeMessage),
  };
}

export function createRequestDeps(params: {
  runtime: RuntimeSubscriptionHarness;
  sendRuntimeMessage: SendRuntimeMessageMock;
  chooseDesktopMediaSource?: ReturnType<typeof vi.fn>;
  isTrustedOffscreenRuntimeSender?: (sender: chrome.runtime.MessageSender) => boolean;
}): DesktopMediaRequestDeps {
  const chooseDesktopMediaSource =
    params.chooseDesktopMediaSource ??
    vi.fn(async (): Promise<DesktopMediaSourceChooserResult> => createSelectedDesktopSource());

  return {
    isTrustedOffscreenRuntimeSender: params.isTrustedOffscreenRuntimeSender ?? (() => true),
    logger: { debug: vi.fn(), log: vi.fn(), warn: vi.fn() },
    sendRuntimeMessage: params.sendRuntimeMessage as DesktopMediaRequestDeps['sendRuntimeMessage'],
    subscribeToMessages: params.runtime.subscribeToMessages,
    chooseDesktopMediaSource: chooseDesktopMediaSource as NonNullable<
      DesktopMediaRequestDeps['chooseDesktopMediaSource']
    >,
  };
}
