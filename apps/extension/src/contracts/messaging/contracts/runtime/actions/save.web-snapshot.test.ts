import { expect, it } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  runtimeActionWebSnapshotSaveMessageContracts,
  WEB_SNAPSHOT_MAX_ASSET_URL_LENGTH,
  WEB_SNAPSHOT_MAX_ASSET_URLS,
} from './save.web-snapshot.ts';

it('parses registered web snapshot asset fetch messages and responses', () => {
  const fetchContract =
    runtimeActionWebSnapshotSaveMessageContracts[MessageType.FETCH_WEB_SNAPSHOT_ASSET];
  const registerContract =
    runtimeActionWebSnapshotSaveMessageContracts[MessageType.REGISTER_WEB_SNAPSHOT_ASSETS];

  expect(
    registerContract.parseRequest({
      assetUrls: ['https://fonts.example.com/demo.woff2'],
      requestId: 'req-web',
      snapshotSessionId: 'snapshot-session-1',
      type: MessageType.REGISTER_WEB_SNAPSHOT_ASSETS,
    })
  ).toEqual({
    assetUrls: ['https://fonts.example.com/demo.woff2'],
    requestId: 'req-web',
    snapshotSessionId: 'snapshot-session-1',
    type: MessageType.REGISTER_WEB_SNAPSHOT_ASSETS,
  });

  expect(
    fetchContract.parseRequest({
      snapshotSessionId: 'snapshot-session-1',
      type: MessageType.FETCH_WEB_SNAPSHOT_ASSET,
      urls: ['https://assets.example.test/example.svg'],
    })
  ).toEqual({
    snapshotSessionId: 'snapshot-session-1',
    type: MessageType.FETCH_WEB_SNAPSHOT_ASSET,
    urls: ['https://assets.example.test/example.svg'],
  });
  expect(() =>
    registerContract.parseRequest({
      assetUrls: Array.from({ length: WEB_SNAPSHOT_MAX_ASSET_URLS + 1 }, (_, index) => {
        return `https://cdn.example.com/${index}.png`;
      }),
      requestId: 'req-web',
      type: MessageType.REGISTER_WEB_SNAPSHOT_ASSETS,
    })
  ).toThrow('runtime REGISTER_WEB_SNAPSHOT_ASSETS message');
  expect(() =>
    fetchContract.parseRequest({
      snapshotSessionId: 'snapshot-session-1',
      type: MessageType.FETCH_WEB_SNAPSHOT_ASSET,
      urls: [`https://cdn.example.com/${'a'.repeat(WEB_SNAPSHOT_MAX_ASSET_URL_LENGTH)}`],
    })
  ).toThrow('runtime FETCH_WEB_SNAPSHOT_ASSET message');
});

it('accepts bounded per-asset batch outcomes and rejects malformed response fields', () => {
  const fetchContract =
    runtimeActionWebSnapshotSaveMessageContracts[MessageType.FETCH_WEB_SNAPSHOT_ASSET];
  const validAssets = [
    {
      base64: 'YQ==',
      mimeType: 'image/png',
      success: true,
      url: 'https://cdn.example.com/a.png',
    },
    {
      error: 'fetch failed',
      success: false,
      url: 'https://cdn.example.com/b.png',
    },
  ];

  expect(fetchContract.parseResponse({ assets: validAssets, success: true })).toEqual({
    assets: validAssets,
    success: true,
  });

  for (const assets of [
    'not-an-array',
    Array.from({ length: 501 }, () => validAssets[0]),
    [{ ...validAssets[0], extra: true }],
    [{ ...validAssets[0], success: 'yes' }],
    [{ ...validAssets[0], url: '' }],
    [{ ...validAssets[0], base64: 42 }],
    [{ ...validAssets[1], error: 42 }],
    [{ ...validAssets[0], mimeType: 42 }],
  ]) {
    expect(() => fetchContract.parseResponse({ assets, success: true })).toThrow(
      'runtime FETCH_WEB_SNAPSHOT_ASSET response'
    );
  }
});
