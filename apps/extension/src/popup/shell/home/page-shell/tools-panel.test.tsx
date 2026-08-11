// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanupRenderedNode, getContainer, renderNode } from './popup-home.test.helpers';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import { ScreenshotToolsPanel } from './tools-panel';

afterEach(cleanupRenderedNode);

it('opens the toolbar directly or with each supported working mode selected', async () => {
  const onOpen = vi.fn();
  await renderNode(<ScreenshotToolsPanel disabledReason={null} onOpen={onOpen} />);

  const buttons = [...(getContainer()?.querySelectorAll('button') ?? [])];
  expect(buttons).toHaveLength(5);
  buttons.forEach((button) => button.click());

  expect(onOpen.mock.calls).toEqual([
    [undefined],
    ['drawing'],
    ['highlighter'],
    ['quick-edit'],
    ['design-review'],
  ]);
  expect(getContainer()?.textContent).toContain('popup.home.toolsOpenLabel');
  expect(getContainer()?.textContent).not.toContain('content.toolbar.designReviewEnable');
  expect(buttons[4]?.title).toBe('content.toolbar.designReviewEnable');
});

it('disables every tools action when page preparation is unavailable', async () => {
  await renderNode(<ScreenshotToolsPanel disabledReason="blocked" onOpen={vi.fn()} />);

  const buttons = [...(getContainer()?.querySelectorAll('button') ?? [])];
  expect(buttons.every((button) => button.disabled && button.title === 'blocked')).toBe(true);
});
