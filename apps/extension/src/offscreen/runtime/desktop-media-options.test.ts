import { expect, it } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { buildDesktopMediaRequestOptions } from './desktop-media-options';

it('keeps only present desktop media acquisition options', () => {
  expect(
    buildDesktopMediaRequestOptions({
      type: VideoMessageType.GET_DESKTOP_MEDIA,
      desktopMediaRequestGeneration: 'generation-1',
      desktopMediaRequestId: 'request-1',
      desktopLabel: 'Window 2',
      desktopStreamId: 'desktop-2',
      sourceCount: 2,
      sourceIndex: 1,
    })
  ).toEqual({
    desktopMediaRequestGeneration: 'generation-1',
    desktopMediaRequestId: 'request-1',
    desktopLabel: 'Window 2',
    desktopStreamId: 'desktop-2',
    sourceCount: 2,
    sourceIndex: 1,
  });

  expect(
    buildDesktopMediaRequestOptions({
      type: VideoMessageType.GET_DESKTOP_MEDIA,
      desktopMediaRequestGeneration: 'generation-1',
      desktopMediaRequestId: 'request-1',
    })
  ).toEqual({
    desktopMediaRequestGeneration: 'generation-1',
    desktopMediaRequestId: 'request-1',
  });
});
