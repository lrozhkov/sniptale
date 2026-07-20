// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { cleanupRenderedNode, createGalleryStatus, renderNode } from '../popup-home.test.helpers';

const { popupHomeActionButtonsSpy } = vi.hoisted(() => ({
  popupHomeActionButtonsSpy: vi.fn(),
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

import { PopupHomeActionRow } from './action-row';

beforeEach(() => {
  popupHomeActionButtonsSpy.mockReset();
});

afterEach(() => {
  cleanupRenderedNode();
  vi.restoreAllMocks();
});

it('composes the gallery title and forwards action-row props to the button group', async () => {
  await renderNode(
    <PopupHomeActionRow
      screenshotDisabled={false}
      screenshotDisabledTitle="Screenshot blocked"
      galleryStatus={createGalleryStatus({ text: '82 MB used' })}
      onOpenScreenshotMode={vi.fn()}
    />
  );

  expect(popupHomeActionButtonsSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      galleryTitle: 'popup.home.galleryTitle. 82 MB used',
      screenshotDisabled: false,
      screenshotDisabledTitle: 'Screenshot blocked',
    })
  );
});

it('falls back to the base gallery title when gallery status is absent', async () => {
  await renderNode(
    <PopupHomeActionRow
      screenshotDisabled
      screenshotDisabledTitle={null}
      galleryStatus={null}
      onOpenScreenshotMode={vi.fn()}
    />
  );

  expect(popupHomeActionButtonsSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      galleryTitle: 'popup.home.galleryTitle',
      screenshotDisabled: true,
      screenshotDisabledTitle: null,
    })
  );
});

it('omits the screenshot disabled title when the action row stays interactive', async () => {
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
