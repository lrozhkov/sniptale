import { expect, it } from 'vitest';

import {
  assertSafeScenarioAssetStorageInput,
  isSafeScenarioAssetImageMimeType,
} from './asset-policy';

it('accepts only supported scenario asset image mime types', () => {
  expect(isSafeScenarioAssetImageMimeType('image/png')).toBe(true);
  expect(isSafeScenarioAssetImageMimeType('image/jpeg; charset=binary')).toBe(true);
  expect(isSafeScenarioAssetImageMimeType(' IMAGE/WEBP ')).toBe(true);
  expect(isSafeScenarioAssetImageMimeType('image/svg+xml')).toBe(false);
});

it('rejects unsafe scenario asset storage input at the DB boundary', () => {
  expect(() =>
    assertSafeScenarioAssetStorageInput(new Blob(['asset'], { type: 'image/png' }), 'image/png')
  ).not.toThrow();

  expect(() => {
    assertSafeScenarioAssetStorageInput(
      new Blob(['asset'], { type: 'image/svg+xml' }),
      'image/svg+xml'
    );
  }).toThrow('Unsupported scenario asset MIME type.');
  expect(() =>
    assertSafeScenarioAssetStorageInput(new Blob([], { type: 'image/png' }), 'image/png')
  ).toThrow('Scenario asset exceeds storage size limit.');
});
