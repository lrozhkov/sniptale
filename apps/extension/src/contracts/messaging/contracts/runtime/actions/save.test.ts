import { expect, it } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { runtimeActionSaveMessageContracts } from './save';

it('requires filenames for screenshot gallery save runtime messages', () => {
  const contract = runtimeActionSaveMessageContracts[MessageType.SAVE_SCREENSHOT_TO_GALLERY];
  const request = {
    dataUrl: 'data:image/png;base64,c2NyZWVueXg=',
    filename: 'capture.png',
    type: MessageType.SAVE_SCREENSHOT_TO_GALLERY,
  };

  expect(contract.parseRequest(request)).toEqual(request);
  expect(() => contract.parseRequest({ dataUrl: request.dataUrl, type: request.type })).toThrow(
    'runtime SAVE_SCREENSHOT_TO_GALLERY message'
  );
});

it('requires gallery update capabilities for editor asset update messages', () => {
  const requestContract =
    runtimeActionSaveMessageContracts[MessageType.REQUEST_GALLERY_IMAGE_UPDATE_CAPABILITY];
  const updateContract = runtimeActionSaveMessageContracts[MessageType.UPDATE_GALLERY_IMAGE_ASSET];
  const capabilityRequest = {
    assetId: 'asset-1',
    editorSessionId: 'session-1',
    type: MessageType.REQUEST_GALLERY_IMAGE_UPDATE_CAPABILITY,
  };
  const updateRequest = {
    assetId: 'asset-1',
    dataUrl: 'data:image/png;base64,c2NyZWVueXg=',
    editorSessionId: 'session-1',
    type: MessageType.UPDATE_GALLERY_IMAGE_ASSET,
    updateCapabilityToken: 'token-1',
  };

  expect(requestContract.parseRequest(capabilityRequest)).toEqual(capabilityRequest);
  expect(
    requestContract.parseResponse({ success: true, updateCapabilityToken: 'token-1' })
  ).toEqual({
    success: true,
    updateCapabilityToken: 'token-1',
  });
  expect(updateContract.parseRequest(updateRequest)).toEqual(updateRequest);
  expect(() =>
    updateContract.parseRequest({ ...updateRequest, updateCapabilityToken: undefined })
  ).toThrow('runtime UPDATE_GALLERY_IMAGE_ASSET message');
});

it('parses popup archive stage requests and responses at the runtime contract', () => {
  const stageContract =
    runtimeActionSaveMessageContracts[MessageType.STAGE_POPUP_EXPORT_ARCHIVE_CHUNK];

  expect(
    stageContract.parseRequest({
      archiveSessionId: 'archive-session-1',
      base64: 'aGVsbG8=',
      chunkIndex: 0,
      stagedArchiveId: 'staged-archive-1',
      totalBytes: 5,
      totalChunks: 1,
      type: MessageType.STAGE_POPUP_EXPORT_ARCHIVE_CHUNK,
    })
  ).toEqual({
    archiveSessionId: 'archive-session-1',
    base64: 'aGVsbG8=',
    chunkIndex: 0,
    stagedArchiveId: 'staged-archive-1',
    totalBytes: 5,
    totalChunks: 1,
    type: MessageType.STAGE_POPUP_EXPORT_ARCHIVE_CHUNK,
  });
  expect(
    stageContract.parseResponse({
      complete: true,
      stagedArchiveId: 'staged-archive-1',
      success: true,
    })
  ).toEqual({
    complete: true,
    stagedArchiveId: 'staged-archive-1',
    success: true,
  });
});

it('parses popup archive final-save requests and responses at the runtime contract', () => {
  const archiveContract = runtimeActionSaveMessageContracts[MessageType.EXPORT_POPUP_SAVE_ARCHIVE];

  expect(
    archiveContract.parseRequest({
      archiveSessionId: 'archive-session-1',
      filename: 'archive.zip',
      mimeType: 'application/zip',
      stagedArchiveId: 'staged-archive-1',
      type: MessageType.EXPORT_POPUP_SAVE_ARCHIVE,
    })
  ).toEqual({
    archiveSessionId: 'archive-session-1',
    filename: 'archive.zip',
    mimeType: 'application/zip',
    stagedArchiveId: 'staged-archive-1',
    type: MessageType.EXPORT_POPUP_SAVE_ARCHIVE,
  });
  expect(archiveContract.parseResponse({ result: 'accepted', success: true })).toEqual({
    result: 'accepted',
    success: true,
  });
});

it('parses popup archive release requests and responses at the runtime contract', () => {
  const releaseContract =
    runtimeActionSaveMessageContracts[MessageType.RELEASE_POPUP_EXPORT_ARCHIVE];

  expect(
    releaseContract.parseRequest({
      archiveSessionId: 'archive-session-1',
      stagedArchiveId: 'staged-archive-1',
      type: MessageType.RELEASE_POPUP_EXPORT_ARCHIVE,
    })
  ).toEqual({
    archiveSessionId: 'archive-session-1',
    stagedArchiveId: 'staged-archive-1',
    type: MessageType.RELEASE_POPUP_EXPORT_ARCHIVE,
  });
  expect(releaseContract.parseResponse({ result: 'released', success: true })).toEqual({
    result: 'released',
    success: true,
  });
});

it('rejects malformed popup archive payloads at the runtime contract', () => {
  const stageContract =
    runtimeActionSaveMessageContracts[MessageType.STAGE_POPUP_EXPORT_ARCHIVE_CHUNK];
  const archiveContract = runtimeActionSaveMessageContracts[MessageType.EXPORT_POPUP_SAVE_ARCHIVE];
  const releaseContract =
    runtimeActionSaveMessageContracts[MessageType.RELEASE_POPUP_EXPORT_ARCHIVE];

  expect(() =>
    stageContract.parseRequest({
      archiveSessionId: 'archive-session-1',
      base64: 'not valid base64',
      chunkIndex: 1,
      stagedArchiveId: 'staged-archive-1',
      totalBytes: 5,
      totalChunks: 1,
      type: MessageType.STAGE_POPUP_EXPORT_ARCHIVE_CHUNK,
    })
  ).toThrow('runtime STAGE_POPUP_EXPORT_ARCHIVE_CHUNK message');
  expect(() =>
    archiveContract.parseRequest({
      base64: 'not valid base64',
      filename: 'archive.zip',
      mimeType: 'application/zip',
      type: MessageType.EXPORT_POPUP_SAVE_ARCHIVE,
    })
  ).toThrow('runtime EXPORT_POPUP_SAVE_ARCHIVE message');
  expect(() =>
    releaseContract.parseRequest({
      archiveSessionId: '../archive-session',
      stagedArchiveId: 'staged-archive-1',
      type: MessageType.RELEASE_POPUP_EXPORT_ARCHIVE,
    })
  ).toThrow('runtime RELEASE_POPUP_EXPORT_ARCHIVE message');
});
