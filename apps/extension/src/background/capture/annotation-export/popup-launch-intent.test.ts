import { beforeEach, expect, it } from 'vitest';

import {
  consumePopupExportLaunchIntent,
  issuePopupExportLaunchIntent,
  resetPopupExportLaunchIntentsForTests,
  revokePopupExportLaunchIntent,
} from './popup-launch-intent';

beforeEach(() => {
  resetPopupExportLaunchIntentsForTests();
});

it('consumes a tab-bound launch intent once', () => {
  issuePopupExportLaunchIntent(7, 1_000);

  expect(consumePopupExportLaunchIntent(8, null, 1_001)).toBeNull();
  expect(consumePopupExportLaunchIntent(7, null, 1_001)).toEqual({ startExport: false });
  expect(consumePopupExportLaunchIntent(7, null, 1_002)).toBeNull();
});

it('rejects an expired launch intent', () => {
  issuePopupExportLaunchIntent(7, 1_000);

  expect(consumePopupExportLaunchIntent(7, null, 11_000)).toBeNull();
  expect(consumePopupExportLaunchIntent(7, null, 1_001)).toBeNull();
});

it('revokes only the matching generation', () => {
  const first = issuePopupExportLaunchIntent(7, 1_000);
  issuePopupExportLaunchIntent(7, 1_001);

  revokePopupExportLaunchIntent(first);
  expect(consumePopupExportLaunchIntent(7, null, 1_002)).toEqual({ startExport: false });
});

it('preserves the requested download mode once and only for its tab and document', () => {
  issuePopupExportLaunchIntent(7, 1000, true, 'document-7');
  expect(consumePopupExportLaunchIntent(8, 'document-7', 1001)).toBeNull();
  expect(consumePopupExportLaunchIntent(7, 'document-7', 1001)).toEqual({
    sourceDocumentId: 'document-7',
    startExport: true,
  });
  expect(consumePopupExportLaunchIntent(7, 'document-7', 1002)).toBeNull();
});

it('rejects the launch intent when its source document no longer matches', () => {
  issuePopupExportLaunchIntent(7, 1000, true, 'original-document');

  expect(consumePopupExportLaunchIntent(7, 'replacement-document', 1001)).toBeNull();
  expect(consumePopupExportLaunchIntent(7, 'original-document', 1002)).toBeNull();
});
