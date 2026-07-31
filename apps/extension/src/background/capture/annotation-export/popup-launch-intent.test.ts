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

  expect(consumePopupExportLaunchIntent(8, 1_001)).toBe(false);
  expect(consumePopupExportLaunchIntent(7, 1_001)).toBe(true);
  expect(consumePopupExportLaunchIntent(7, 1_002)).toBe(false);
});

it('rejects an expired launch intent', () => {
  issuePopupExportLaunchIntent(7, 1_000);

  expect(consumePopupExportLaunchIntent(7, 11_000)).toBe(false);
  expect(consumePopupExportLaunchIntent(7, 1_001)).toBe(false);
});

it('revokes only the matching generation', () => {
  const first = issuePopupExportLaunchIntent(7, 1_000);
  issuePopupExportLaunchIntent(7, 1_001);

  revokePopupExportLaunchIntent(first);
  expect(consumePopupExportLaunchIntent(7, 1_002)).toBe(true);
});
