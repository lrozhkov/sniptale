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
      url: 'https://upload.wikimedia.org/example.svg',
    })
  ).toEqual({
    snapshotSessionId: 'snapshot-session-1',
    type: MessageType.FETCH_WEB_SNAPSHOT_ASSET,
    url: 'https://upload.wikimedia.org/example.svg',
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
      url: `https://cdn.example.com/${'a'.repeat(WEB_SNAPSHOT_MAX_ASSET_URL_LENGTH)}`,
    })
  ).toThrow('runtime FETCH_WEB_SNAPSHOT_ASSET message');
});
