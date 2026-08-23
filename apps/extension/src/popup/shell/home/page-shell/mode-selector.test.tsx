// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanupRenderedNode, getContainer, renderNode } from './popup-home.test.helpers';

vi.mock('../../../../platform/i18n/popup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n/popup')>()),
  translate: (key: string) => key,
}));
import { ScreenshotModeSelector } from './mode-selector';

afterEach(cleanupRenderedNode);

it('switches between shortcuts, tab and desktop capture with an expanded active mode', async () => {
  const onModeChange = vi.fn();
  await renderNode(
    <ScreenshotModeSelector mode="tab" tabDisabledReason={null} onModeChange={onModeChange} />
  );
  (
    getContainer()!.querySelector(
      '[aria-label="popup.home.captureWindowLabel"]'
    ) as HTMLButtonElement
  ).click();
  (
    getContainer()!.querySelector(
      '[aria-label="popup.home.shortcutsModeLabel"]'
    ) as HTMLButtonElement
  ).click();
  expect(onModeChange).toHaveBeenCalledWith('desktop');
  expect(onModeChange).toHaveBeenCalledWith('quick-actions');
  expect(getContainer()?.textContent).toContain('popup.home.shortcutsModeLabel');
  expect(
    getContainer()?.querySelector('[aria-label="popup.home.captureTabLabel"]')?.className
  ).toContain('grow-[1.9]');
  expect(getContainer()?.textContent).toContain('popup.home.captureTabHint');
});

it('disables tab independently from desktop capture', async () => {
  await renderNode(
    <ScreenshotModeSelector mode="desktop" tabDisabledReason="blocked" onModeChange={vi.fn()} />
  );
  expect(
    (
      getContainer()!.querySelector(
        '[aria-label="popup.home.captureTabLabel"]'
      ) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  expect(
    (
      getContainer()!.querySelector(
        '[aria-label="popup.home.captureWindowLabel"]'
      ) as HTMLButtonElement
    ).disabled
  ).toBe(false);
});
