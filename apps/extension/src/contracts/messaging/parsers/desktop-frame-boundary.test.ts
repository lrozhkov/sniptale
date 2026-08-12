import { expect, it } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { parseOffscreenRuntimeMessage, parseRuntimeResponseForMessage } from './boundary';

const pngDataUrl =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=';

it('parses the bounded offscreen PNG clipboard command', () => {
  const message = {
    type: MessageType.OFFSCREEN_WRITE_IMAGE_CLIPBOARD,
    capabilityToken: 'capability',
    requestId: 'desktop-capture:clipboard',
    dataUrl: pngDataUrl,
  };
  expect(parseOffscreenRuntimeMessage(message)).toEqual(message);
  expect(
    parseRuntimeResponseForMessage(MessageType.OFFSCREEN_WRITE_IMAGE_CLIPBOARD, {
      success: true,
      result: 'copied',
    })
  ).toEqual({ success: true, result: 'copied' });
});

it('rejects non-PNG and malformed clipboard commands', () => {
  for (const dataUrl of ['data:image/webp;base64,AA==', 'data:text/plain;base64,QQ==']) {
    expect(() =>
      parseOffscreenRuntimeMessage({
        type: MessageType.OFFSCREEN_WRITE_IMAGE_CLIPBOARD,
        capabilityToken: 'capability',
        requestId: 'desktop-capture:clipboard',
        dataUrl,
      })
    ).toThrow();
  }
});
