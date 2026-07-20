// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { cleanupRenderedNode, getContainer, renderNode } from '../popup-home.test.helpers';

const { openGallerySpy, openImageEditorSpy, openScenarioEditorSpy } = vi.hoisted(() => ({
  openGallerySpy: vi.fn(),
  openImageEditorSpy: vi.fn(),
  openScenarioEditorSpy: vi.fn(),
}));
const popupActionButtonMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../../platform/i18n', (_importOriginal) => ({
  translate: (key: string) => key,
}));

vi.mock('../../../../../ui/popup-shell/action-button', (_importOriginal) => ({
  PopupActionButton: (props: {
    dataUi: string;
    disabled?: boolean;
    iconClassName: string;
    label: string;
    title?: string;
    onClick: () => void;
  }) => {
    popupActionButtonMock(props);
    return (
      <button
        data-ui={props.dataUi}
        disabled={props.disabled}
        title={props.title}
        onClick={props.onClick}
      >
        {props.label}
      </button>
    );
  },
}));

vi.mock('../../../navigation/actions', (_importOriginal) => ({
  openGallery: openGallerySpy,
  openImageEditor: openImageEditorSpy,
  openScenarioEditor: openScenarioEditorSpy,
}));

import { PopupHomeActionButtons } from './buttons';
import { PopupHomeQuickActionsEmptyState } from './empty-state';

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  openGallerySpy.mockReset();
  openImageEditorSpy.mockReset();
  openScenarioEditorSpy.mockReset();
  popupActionButtonMock.mockReset();
});

afterEach(() => {
  cleanupRenderedNode();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('renders the popup home action buttons and delegates clicks', async () => {
  const onOpenScreenshotMode = vi.fn();

  await renderNode(
    <PopupHomeActionButtons
      screenshotDisabled={false}
      screenshotDisabledTitle="Blocked"
      galleryTitle="popup.home.galleryTitle. 82 MB used"
      onOpenScreenshotMode={onOpenScreenshotMode}
    />
  );

  const buttons = Array.from(getContainer()?.querySelectorAll<HTMLButtonElement>('button') ?? []);

  expect(buttons).toHaveLength(4);
  expect(buttons[0]?.title).toBe('Blocked');
  expect(buttons[1]?.title).toBe('popup.home.imageEditorTitle');
  expect(buttons[2]?.title).toBe('popup.home.scenarioEditorTitle');
  expect(buttons[3]?.title).toBe('popup.home.galleryTitle. 82 MB used');

  act(() => {
    buttons[0]?.click();
    buttons[1]?.click();
    buttons[2]?.click();
    buttons[3]?.click();
  });

  expect(onOpenScreenshotMode).toHaveBeenCalledTimes(1);
  expect(openImageEditorSpy).toHaveBeenCalledTimes(1);
  expect(openScenarioEditorSpy).toHaveBeenCalledTimes(1);
  expect(openGallerySpy).toHaveBeenCalledTimes(1);
});

it('falls back to the translated screenshot title when a custom title is absent', async () => {
  await renderNode(
    <PopupHomeActionButtons
      screenshotDisabled
      screenshotDisabledTitle={null}
      galleryTitle="popup.home.galleryTitle"
      onOpenScreenshotMode={vi.fn()}
    />
  );

  const buttons = Array.from(getContainer()?.querySelectorAll<HTMLButtonElement>('button') ?? []);

  expect(buttons[0]?.disabled).toBe(true);
  expect(buttons[0]?.title).toBe('popup.home.screenshotPrepTitle');
});

it('passes accent hover and focus icon classes only to the screenshot prep CTA', async () => {
  await renderNode(
    <PopupHomeActionButtons
      screenshotDisabled={false}
      screenshotDisabledTitle={null}
      galleryTitle="popup.home.galleryTitle"
      onOpenScreenshotMode={vi.fn()}
    />
  );

  const screenshotPrepCall = popupActionButtonMock.mock.calls.find(
    ([props]) => props.dataUi === 'popup.home.screenshot-prep-button'
  )?.[0];
  const imageEditorCall = popupActionButtonMock.mock.calls.find(
    ([props]) => props.dataUi === 'popup.home.image-editor-button'
  )?.[0];

  expect(screenshotPrepCall?.iconClassName).toContain(
    'group-hover:text-[var(--sniptale-color-accent-emphasis)]'
  );
  expect(screenshotPrepCall?.iconClassName).toContain(
    'group-focus-visible:text-[var(--sniptale-color-accent-emphasis)]'
  );
  expect(imageEditorCall?.iconClassName).not.toContain('group-hover:text-');
});

it('renders the popup home quick-actions empty state copy', async () => {
  await renderNode(<PopupHomeQuickActionsEmptyState />);

  expect(getContainer()?.textContent).toContain('popup.home.quickActionsEmpty');
});
