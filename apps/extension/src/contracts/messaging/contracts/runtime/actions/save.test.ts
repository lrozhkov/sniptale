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
  expect(() => contract.parseRequest({ ...request, storageClass: 'library' })).toThrow(
    'runtime SAVE_SCREENSHOT_TO_GALLERY message'
  );
  expect(
    contract.parseResponse({
      assetId: 'asset-1',
      editorAssetCapability: { requestId: 'capture-1', token: 'editor-1' },
      success: true,
    })
  ).toEqual({
    assetId: 'asset-1',
    editorAssetCapability: { requestId: 'capture-1', token: 'editor-1' },
    success: true,
  });
  expect(() =>
    contract.parseResponse({
      assetId: 'asset-1',
      editorAssetCapability: { requestId: 'capture-1', token: 'editor-1', extra: true },
      success: true,
    })
  ).toThrow('runtime SAVE_SCREENSHOT_TO_GALLERY response');
  expect(() =>
    contract.parseResponse({
      editorAssetCapability: { requestId: 'capture-1', token: 'editor-1' },
      success: true,
    })
  ).toThrow('runtime SAVE_SCREENSHOT_TO_GALLERY response');
});

it('requires the transformed image and filename as one gallery response pair', () => {
  const contract = runtimeActionSaveMessageContracts[MessageType.SAVE_SCREENSHOT_TO_GALLERY];
  expect(() =>
    contract.parseResponse({ success: true, dataUrl: 'data:image/png;base64,AA==' })
  ).toThrow();
  expect(() => contract.parseResponse({ success: true, filename: 'styled.png' })).toThrow();
  expect(
    contract.parseResponse({
      success: true,
      dataUrl: 'data:image/png;base64,AA==',
      filename: 'styled.png',
    })
  ).toMatchObject({ filename: 'styled.png' });
});

it('bounds quick-action transaction identities for both save commands', () => {
  for (const type of [MessageType.EXECUTE_SAVE, MessageType.SAVE_SCREENSHOT_TO_GALLERY]) {
    const contract = runtimeActionSaveMessageContracts[type];
    const request = { type, dataUrl: 'data:image/png;base64,AA==', filename: 'styled.png' };
    expect(contract.parseRequest({ ...request, quickActionTransactionId: 'tx-1' })).toMatchObject({
      quickActionTransactionId: 'tx-1',
    });
    for (const quickActionTransactionId of ['', 'x'.repeat(129), 3]) {
      expect(() => contract.parseRequest({ ...request, quickActionTransactionId })).toThrow();
    }
  }
});

it('accepts the actual screenshot destination and rejects unknown action types', () => {
  const contract = runtimeActionSaveMessageContracts[MessageType.SAVE_SCREENSHOT_TO_GALLERY];
  const request = {
    type: MessageType.SAVE_SCREENSHOT_TO_GALLERY,
    dataUrl: 'data:image/png;base64,AA==',
    filename: 'capture.png',
  };
  expect(contract.parseRequest({ ...request, actionType: 'copy' })).toMatchObject({
    actionType: 'copy',
  });
  for (const actionType of ['bogus', 2, null])
    expect(() => contract.parseRequest({ ...request, actionType })).toThrow();
});
