// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  cleanupRenderedNode,
  createQuickAction,
  getContainer,
  renderNode,
} from './popup-home.test.helpers';

const { quickActionsBlockSpy } = vi.hoisted(() => ({ quickActionsBlockSpy: vi.fn() }));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../quick-actions/block', (_importOriginal) => ({
  QuickActionsBlock: (props: unknown) => {
    quickActionsBlockSpy(props);
    return <div data-testid="quick-actions-block">QuickActionsBlock</div>;
  },
}));

import { PopupHomeErrorMessage, PopupHomeQuickActions } from './sections';

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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
      viewportPresets={[]}
      quickActionsDisabledTitle={null}
      restrictionIndicatorTitle="Restricted"
      onTriggerAction={vi.fn()}
    />
  );

  const content = getContainer()?.firstElementChild;

  expect(getContainer()?.textContent).not.toContain('popup.home.quickActionsTitle');
  expect(getContainer()?.textContent).toContain('popup.home.quickActionsEmpty');
  expect(getContainer()?.querySelector('[data-testid="quick-actions-block"]')).toBeNull();
  expect(
    getContainer()?.querySelector('[data-ui="popup.home.quick-actions-restriction-indicator"]')
  ).toBeNull();
  expect(content?.className).toContain('overflow-y-auto');
  expect(getContainer()?.querySelector('section')).toBeNull();
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
      viewportPresets={[]}
      quickActionsDisabledTitle={null}
      restrictionIndicatorTitle={null}
      onTriggerAction={onTriggerAction}
    />
  );

  expect(getContainer()?.innerHTML).toBe('');
});

it('renders the popup home error message copy', async () => {
  await renderNode(<PopupHomeErrorMessage message="Action failed" />);

  expect(getContainer()?.textContent).toContain('Action failed');
  expect(getContainer()?.querySelector('div')?.className).toContain('rounded-[16px]');
});
