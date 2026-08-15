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
});
