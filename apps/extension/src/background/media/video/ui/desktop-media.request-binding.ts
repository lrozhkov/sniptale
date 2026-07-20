import type {
  DesktopMediaCancelledMessage,
  DesktopMediaFailedMessage,
  DesktopMediaObtainedMessage,
} from '../../../../contracts/video/types/messages';

export type DesktopMediaSelectionMessage =
  | DesktopMediaObtainedMessage
  | DesktopMediaCancelledMessage
  | DesktopMediaFailedMessage;

export type DesktopMediaRequestBinding = {
  desktopMediaRequestGeneration: string;
  desktopMediaRequestId: string;
  sourceCount?: number;
  sourceIndex?: number;
};

type DesktopMediaBindingOptions = {
  sourceCount?: number;
  sourceIndex?: number;
};

function createDesktopMediaRequestToken(): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (!randomUUID) {
    throw new Error('Desktop media request token generation is unavailable.');
  }
  return randomUUID.call(globalThis.crypto);
}

export function createDesktopMediaRequestBinding(
  options: DesktopMediaBindingOptions
): DesktopMediaRequestBinding {
  return {
    desktopMediaRequestGeneration: createDesktopMediaRequestToken(),
    desktopMediaRequestId: createDesktopMediaRequestToken(),
    ...(options.sourceCount === undefined ? {} : { sourceCount: options.sourceCount }),
    ...(options.sourceIndex === undefined ? {} : { sourceIndex: options.sourceIndex }),
  };
}

export function isDesktopMediaSelectionForRequest(
  parsedMessage: DesktopMediaSelectionMessage,
  binding: DesktopMediaRequestBinding
): boolean {
  return (
    parsedMessage.desktopMediaRequestGeneration === binding.desktopMediaRequestGeneration &&
    parsedMessage.desktopMediaRequestId === binding.desktopMediaRequestId &&
    parsedMessage.sourceCount === binding.sourceCount &&
    parsedMessage.sourceIndex === binding.sourceIndex
  );
}
