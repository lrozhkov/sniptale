import { beforeEach, expect, it, vi } from 'vitest';

const clipboardMocks = vi.hoisted(() => ({
  showToast: vi.fn(),
  writeBrowserClipboardText: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/clipboard', () => ({
  writeBrowserClipboardText: clipboardMocks.writeBrowserClipboardText,
}));
vi.mock('@sniptale/ui/product-feedback/toast-service', () => ({
  showToast: clipboardMocks.showToast,
}));
vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import { copyDesignReviewText } from './clipboard';

beforeEach(() => {
  vi.clearAllMocks();
});

it('confirms a successful Design Review clipboard write', async () => {
  clipboardMocks.writeBrowserClipboardText.mockResolvedValue(undefined);

  await expect(
    copyDesignReviewText('html > body > h1', 'content.designReview.pathCopied')
  ).resolves.toBe(true);

  expect(clipboardMocks.writeBrowserClipboardText).toHaveBeenCalledWith('html > body > h1');
  expect(clipboardMocks.showToast).toHaveBeenCalledWith(
    'content.designReview.pathCopied',
    'success'
  );
});

it('surfaces clipboard denial without rejecting the UI action', async () => {
  clipboardMocks.writeBrowserClipboardText.mockRejectedValue(new DOMException('Denied'));

  await expect(
    copyDesignReviewText('{"tagName":"h1"}', 'content.designReview.elementCopied')
  ).resolves.toBe(false);

  expect(clipboardMocks.showToast).toHaveBeenCalledWith('content.designReview.copyFailed', 'error');
});
