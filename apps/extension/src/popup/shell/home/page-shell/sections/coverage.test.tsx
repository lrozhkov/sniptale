// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { cleanupRenderedNode, renderNode } from '../popup-home.test.helpers';

const { popupHomeActionButtonsSpy, quickActionsBlockSpy } = vi.hoisted(() => ({
  popupHomeActionButtonsSpy: vi.fn(),
  quickActionsBlockSpy: vi.fn(),
}));

vi.mock('../../../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

vi.mock('./buttons', () => ({
  PopupHomeActionButtons: (props: unknown) => {
    popupHomeActionButtonsSpy(props);
    return <div data-testid="popup-home-action-buttons" />;
  },
}));

vi.mock('../../quick-actions/block', () => ({
  QuickActionsBlock: (props: unknown) => {
    quickActionsBlockSpy(props);
    return <div data-testid="quick-actions-block" />;
  },
}));

import { PopupHomeActionRow } from './action-row';
import { PopupHomeQuickActions } from './quick-actions-section';

beforeEach(() => {
  popupHomeActionButtonsSpy.mockReset();
  quickActionsBlockSpy.mockReset();
});

afterEach(() => {
  cleanupRenderedNode();
  vi.restoreAllMocks();
});

it('omits the screenshot disabled title when the action row receives no explicit title', async () => {
  await renderNode(
    <PopupHomeActionRow
      screenshotDisabled={false}
      galleryStatus={null}
      onOpenScreenshotMode={vi.fn()}
    />
  );

  expect(popupHomeActionButtonsSpy).toHaveBeenCalledWith({
    galleryTitle: 'popup.home.galleryTitle',
    onOpenScreenshotMode: expect.any(Function),
    screenshotDisabled: false,
  });
});

it('hides the quick-actions section entirely when it should not be shown', async () => {
  await renderNode(
    <PopupHomeQuickActions
      shouldShowQuickActions={false}
      quickActionsReady
      hasQuickActions
      quickActions={[{ id: 'action-1' } as never]}
      displayMode="list"
      viewportPresets={[]}
      onTriggerAction={vi.fn()}
    />
  );

  expect(quickActionsBlockSpy).not.toHaveBeenCalled();
});

it('omits the disabled title when quick actions stay interactive', async () => {
  const action = { id: 'action-1' };

  await renderNode(
    <PopupHomeQuickActions
      shouldShowQuickActions
      quickActionsReady
      hasQuickActions
      quickActions={[action] as never}
      displayMode="list"
      viewportPresets={[]}
      onTriggerAction={vi.fn()}
    />
  );

  expect(quickActionsBlockSpy).toHaveBeenCalledWith({
    actions: [action],
    displayMode: 'list',
    onTriggerAction: expect.any(Function),
    presets: [],
  });
});
