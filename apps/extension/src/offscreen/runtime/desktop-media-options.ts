import type { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

type DesktopMediaRequestMessage = {
  type: typeof VideoMessageType.GET_DESKTOP_MEDIA;
  desktopLabel?: string;
  desktopMediaRequestGeneration: string;
  desktopMediaRequestId: string;
  desktopStreamId?: string;
  sourceCount?: number;
  sourceIndex?: number;
};

export function buildDesktopMediaRequestOptions(message: DesktopMediaRequestMessage) {
  return {
    desktopMediaRequestGeneration: message.desktopMediaRequestGeneration,
    desktopMediaRequestId: message.desktopMediaRequestId,
    ...(message.desktopLabel === undefined ? {} : { desktopLabel: message.desktopLabel }),
    ...(message.desktopStreamId === undefined ? {} : { desktopStreamId: message.desktopStreamId }),
    ...(message.sourceCount === undefined ? {} : { sourceCount: message.sourceCount }),
    ...(message.sourceIndex === undefined ? {} : { sourceIndex: message.sourceIndex }),
  };
}
