// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanupRenderedNode, getContainer, renderNode } from './popup-home.test.helpers';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
import { ScreenshotModeSelector } from './mode-selector';

afterEach(cleanupRenderedNode);

it('selects all four persisted popup modes', async () => {
  const onModeChange = vi.fn();
  await renderNode(
    <ScreenshotModeSelector
      mode="quick-actions"
      tabDisabledReason={null}
      toolsDisabledReason={null}
      onModeChange={onModeChange}
    />
  );
  (
    getContainer()?.querySelector(
      '[aria-label="popup.home.captureWindowLabel"]'
    ) as HTMLButtonElement
  ).click();
  (
    getContainer()?.querySelector('[aria-label="popup.home.toolsLabel"]') as HTMLButtonElement
  ).click();
  expect(onModeChange).toHaveBeenCalledWith('desktop');
  expect(onModeChange).toHaveBeenCalledWith('tools');
  expect(getContainer()?.textContent).toContain('popup.home.shortcutsModeLabel');
});

it('disables tab and tools independently from desktop capture', async () => {
  await renderNode(
    <ScreenshotModeSelector
      mode="desktop"
      tabDisabledReason="blocked"
      toolsDisabledReason="blocked"
      onModeChange={vi.fn()}
    />
  );
  expect(
    (
      getContainer()?.querySelector(
        '[aria-label="popup.home.captureTabLabel"]'
      ) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  expect(
    (
      getContainer()?.querySelector(
        '[aria-label="popup.home.captureWindowLabel"]'
      ) as HTMLButtonElement
    ).disabled
  ).toBe(false);
  expect(
    (getContainer()?.querySelector('[aria-label="popup.home.toolsLabel"]') as HTMLButtonElement)
      .title
  ).toContain('blocked');
});
