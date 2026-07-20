// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  cleanupRenderedNode,
  createQuickAction,
  getContainer,
  renderNode,
} from '../popup-home.test.helpers';

const { quickActionsBlockSpy } = vi.hoisted(() => ({
  quickActionsBlockSpy: vi.fn(),
}));

vi.mock('../../../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

vi.mock('../../quick-actions/block', () => ({
  QuickActionsBlock: (props: unknown) => {
    quickActionsBlockSpy(props);
    return <div data-testid="quick-actions-block" />;
  },
}));

import { PopupHomeQuickActions } from './quick-actions-section';

beforeEach(() => {
  vi.useFakeTimers();
  quickActionsBlockSpy.mockReset();
});

afterEach(() => {
  cleanupRenderedNode();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('renders the quick-actions section empty state when no actions are available', async () => {
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

  expect(
    getContainer()?.querySelector('[data-ui="popup.home.quick-actions-restriction-indicator"]')
  ).not.toBeNull();
  expect(quickActionsBlockSpy).not.toHaveBeenCalled();
});

it('forwards quick-actions section props to the list block when actions exist', async () => {
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
});

it('omits the disabled title when quick actions are available without restrictions', async () => {
  const action = createQuickAction({ id: 'quick-action-2' });

  await renderNode(
    <PopupHomeQuickActions
      shouldShowQuickActions
      quickActionsReady
      hasQuickActions
      quickActions={[action]}
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

it('delays the loading placeholder while quick-actions bootstrap is pending', async () => {
  await renderNode(
    <PopupHomeQuickActions
      shouldShowQuickActions
      quickActionsReady={false}
      hasQuickActions={false}
      quickActions={[]}
      displayMode="list"
      viewportPresets={[]}
      onTriggerAction={vi.fn()}
    />
  );

  expect(getContainer()?.querySelector('[data-ui="popup.home.quick-actions-loading"]')).toBeNull();

  await act(async () => {
    vi.advanceTimersByTime(350);
  });

  expect(
    getContainer()?.querySelector('[data-ui="popup.home.quick-actions-loading"]')
  ).not.toBeNull();
  expect(getContainer()?.textContent).not.toContain('popup.home.quickActionsEmpty');
  expect(quickActionsBlockSpy).not.toHaveBeenCalled();
});

it('keeps the delayed loading placeholder hidden when quick-actions become ready quickly', async () => {
  const action = createQuickAction({ id: 'quick-action-ready' });

  await renderNode(
    <PopupHomeQuickActions
      shouldShowQuickActions
      quickActionsReady={false}
      hasQuickActions={false}
      quickActions={[]}
      displayMode="list"
      viewportPresets={[]}
      onTriggerAction={vi.fn()}
    />
  );
  await renderNode(
    <PopupHomeQuickActions
      shouldShowQuickActions
      quickActionsReady
      hasQuickActions
      quickActions={[action]}
      displayMode="list"
      viewportPresets={[]}
      onTriggerAction={vi.fn()}
    />
  );

  await act(async () => {
    vi.advanceTimersByTime(350);
  });

  expect(getContainer()?.querySelector('[data-ui="popup.home.quick-actions-loading"]')).toBeNull();
  expect(quickActionsBlockSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      actions: [action],
    })
  );
});
