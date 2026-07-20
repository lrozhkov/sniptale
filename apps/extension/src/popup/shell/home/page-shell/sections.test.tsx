// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  cleanupRenderedNode,
  createGalleryStatus,
  createQuickAction,
  getContainer,
  renderNode,
} from './popup-home.test.helpers';

const { openGallerySpy, openImageEditorSpy, openScenarioEditorSpy, quickActionsBlockSpy } =
  vi.hoisted(() => ({
    openGallerySpy: vi.fn(),
    openImageEditorSpy: vi.fn(),
    openScenarioEditorSpy: vi.fn(),
    quickActionsBlockSpy: vi.fn(),
  }));

vi.mock('../../../../platform/i18n', (_importOriginal) => ({
  translate: (key: string) => key,
}));

vi.mock('../../../../ui/popup-shell/action-button', (_importOriginal) => ({
  PopupActionButton: (props: {
    dataUi: string;
    disabled?: boolean;
    label: string;
    title?: string;
    onClick: () => void;
  }) => (
    <button
      data-ui={props.dataUi}
      disabled={props.disabled}
      title={props.title}
      onClick={props.onClick}
    >
      {props.label}
    </button>
  ),
}));

vi.mock('../../navigation/actions', (_importOriginal) => ({
  openGallery: openGallerySpy,
  openImageEditor: openImageEditorSpy,
  openScenarioEditor: openScenarioEditorSpy,
}));

vi.mock('../quick-actions/block', (_importOriginal) => ({
  QuickActionsBlock: (props: unknown) => {
    quickActionsBlockSpy(props);
    return <div data-testid="quick-actions-block">QuickActionsBlock</div>;
  },
}));

import { PopupHomeActionRow, PopupHomeErrorMessage, PopupHomeQuickActions } from './sections';

function getActionRowButtons() {
  return Array.from(getContainer()?.querySelectorAll<HTMLButtonElement>('button') ?? []);
}

function expectActionRowTitles(buttons: HTMLButtonElement[]) {
  expect(buttons).toHaveLength(4);
  expect(buttons[0]?.title).toBe('Screenshot blocked');
  expect(buttons[1]?.title).toBe('popup.home.imageEditorTitle');
  expect(buttons[2]?.title).toBe('popup.home.scenarioEditorTitle');
  expect(buttons[3]?.title).toBe('popup.home.galleryTitle. 82 MB used');
}

function clickActionRowButtons(buttons: HTMLButtonElement[]) {
  act(() => {
    buttons[0]?.click();
    buttons[1]?.click();
    buttons[2]?.click();
    buttons[3]?.click();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  openGallerySpy.mockReset();
  openImageEditorSpy.mockReset();
  openScenarioEditorSpy.mockReset();
  quickActionsBlockSpy.mockReset();
});

afterEach(() => {
  cleanupRenderedNode();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('renders the quick-actions empty state when the owner is visible without actions', async () => {
  await renderNode(
    <PopupHomeQuickActions
      shouldShowQuickActions
      quickActionsReady
      hasQuickActions={false}
      quickActions={[]}
      displayMode="list"
      viewportPresets={[]}
      quickActionsDisabledTitle={null}
      restrictionIndicatorTitle="Restricted"
      onTriggerAction={vi.fn()}
    />
  );

  const section = getContainer()?.querySelector('section');

  expect(getContainer()?.textContent).toContain('popup.home.quickActionsTitle');
  expect(getContainer()?.textContent).toContain('popup.home.quickActionsEmpty');
  expect(getContainer()?.querySelector('[data-testid="quick-actions-block"]')).toBeNull();
  expect(
    getContainer()?.querySelector('[data-ui="popup.home.quick-actions-restriction-indicator"]')
  ).not.toBeNull();
  expect(section?.className).toContain('rounded-[16px]');
});

it('forwards the quick-actions owner props to the list block and hides the section when disabled', async () => {
  const action = createQuickAction({ id: 'quick-action-1' });
  const onTriggerAction = vi.fn();

  await renderNode(
    <PopupHomeQuickActions
      shouldShowQuickActions
      quickActionsReady
      hasQuickActions
      quickActions={[action]}
      displayMode="list"
      viewportPresets={[]}
      quickActionsDisabledTitle="Blocked reason"
      restrictionIndicatorTitle={null}
      onTriggerAction={onTriggerAction}
    />
  );

  expect(quickActionsBlockSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      actions: [action],
      disabledTitle: 'Blocked reason',
      displayMode: 'list',
      onTriggerAction,
      presets: [],
    })
  );

  await renderNode(
    <PopupHomeQuickActions
      shouldShowQuickActions={false}
      quickActionsReady
      hasQuickActions
      quickActions={[action]}
      displayMode="list"
      viewportPresets={[]}
      quickActionsDisabledTitle={null}
      restrictionIndicatorTitle={null}
      onTriggerAction={onTriggerAction}
    />
  );

  expect(getContainer()?.innerHTML).toBe('');
});

it('renders the action row titles and delegates button clicks', async () => {
  const onOpenScreenshotMode = vi.fn();

  await renderNode(
    <PopupHomeActionRow
      screenshotDisabled={false}
      screenshotDisabledTitle="Screenshot blocked"
      galleryStatus={createGalleryStatus({ text: '82 MB used' })}
      onOpenScreenshotMode={onOpenScreenshotMode}
    />
  );

  const buttons = getActionRowButtons();
  expectActionRowTitles(buttons);
  clickActionRowButtons(buttons);

  expect(onOpenScreenshotMode).toHaveBeenCalled();
  expect(openImageEditorSpy).toHaveBeenCalled();
  expect(openScenarioEditorSpy).toHaveBeenCalled();
  expect(openGallerySpy).toHaveBeenCalled();
});

it('renders the popup home error message copy', async () => {
  await renderNode(<PopupHomeErrorMessage message="Action failed" />);

  expect(getContainer()?.textContent).toContain('Action failed');
  expect(getContainer()?.querySelector('div')?.className).toContain('rounded-[16px]');
});
