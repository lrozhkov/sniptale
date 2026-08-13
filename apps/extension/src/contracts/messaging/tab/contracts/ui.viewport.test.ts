import { expect, it } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { tabUiMessageContracts } from './ui';

it('accepts exact viewport/window change notifications and Current size', () => {
  const contract = tabUiMessageContracts[MessageType.VIEWPORT_CHANGED];
  expect(
    contract.parseRequest({
      type: MessageType.VIEWPORT_CHANGED,
      viewport: {
        height: 720,
        presetId: 'window-1',
        target: 'window',
        width: 1280,
      },
    })
  ).toEqual({
    type: MessageType.VIEWPORT_CHANGED,
    viewport: {
      height: 720,
      presetId: 'window-1',
      target: 'window',
      width: 1280,
    },
  });
  expect(contract.parseRequest({ type: MessageType.VIEWPORT_CHANGED, viewport: null })).toEqual({
    type: MessageType.VIEWPORT_CHANGED,
    viewport: null,
  });
});

it('rejects malformed viewport notifications', () => {
  const contract = tabUiMessageContracts[MessageType.VIEWPORT_CHANGED];
  expect(() =>
    contract.parseRequest({
      type: MessageType.VIEWPORT_CHANGED,
      viewport: { height: 720, presetId: 'preset-1', target: 'screen', width: 1280 },
    })
  ).toThrow(/VIEWPORT_CHANGED/);
  expect(() =>
    contract.parseRequest({
      type: MessageType.VIEWPORT_CHANGED,
      viewport: { height: 720, presetId: 'preset-1', target: 'viewport', width: 1280 },
    })
  ).toThrow(/VIEWPORT_CHANGED/);
  expect(() =>
    contract.parseRequest({
      type: MessageType.VIEWPORT_CHANGED,
      viewport: { height: 720, presetId: 'preset-1', target: 'window', width: '1280' },
    })
  ).toThrow(/VIEWPORT_CHANGED/);
});
