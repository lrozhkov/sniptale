// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  cleanupRenderedNode,
  createQuickAction,
  getContainer,
  renderNode,
} from '../page-shell/popup-home.test.helpers';

const { dynamicIconSpy } = vi.hoisted(() => ({
  dynamicIconSpy: vi.fn(),
}));

vi.mock('../../../../features/quick-actions-presets/catalog', () => ({
  createBundledQuickAction: vi.fn(),
  getBundledQuickActionConfig: vi.fn(),
  DEFAULT_QUICK_ACTIONS_DISPLAY_MODE: 'list',
  getBundledQuickActions: vi.fn(),
  getQuickActionDisplayName: (action: { id: string }) => `display:${action.id}`,
  isBundledQuickAction: vi.fn(),
  mergeStoredQuickActions: vi.fn(),
  normalizeQuickAction: vi.fn(),
  sanitizeQuickActionsDisplayMode: vi.fn(),
}));

vi.mock('../../navigation/actions', () => ({
  DynamicIcon: (props: { color?: string; name: string }) => {
    dynamicIconSpy(props);
    return <span data-testid="dynamic-icon">{props.name}</span>;
  },
  IDLE_RECORDING_STATE: null,
  PopupPage: undefined,
  describeCaptureSource: vi.fn(),
  formatDuration: vi.fn(),
  formatHotkeyShort: () => 'Ctrl+Shift+K',
  getCaptureModeLabels: vi.fn(),
  getQuickActionMeta: () => 'Visible page',
  getQuickActionColor: vi.fn(),
  getRecordingStatusLabel: vi.fn(),
  getViewportPresetLabel: vi.fn(),
  openDesignSystem: vi.fn(),
  openGallery: vi.fn(),
  openImageEditor: vi.fn(),
  openScenarioEditor: vi.fn(),
  openScreenshotMode: vi.fn(),
  openSettings: vi.fn(),
  openGithubRepository: vi.fn(),
  openVideoEditor: vi.fn(),
  triggerQuickAction: vi.fn(),
}));

import { QuickActionListItem } from './block-items/item';

async function renderDensityVariant(
  density: 'regular' | 'compact' | 'dense' | 'tight',
  onTriggerAction: (actionId: string) => void
) {
  await renderNode(
    <QuickActionListItem
      action={createQuickAction({ id: density })}
      presets={[]}
      density={density}
      onTriggerAction={onTriggerAction}
    />
  );
}

function expectDensityMeta(density: 'regular' | 'compact' | 'dense' | 'tight') {
  if (density === 'regular' || density === 'compact') {
    expect(getContainer()?.textContent).toContain('Visible page');
    return;
  }

  expect(getContainer()?.textContent).not.toContain('Visible page');
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  dynamicIconSpy.mockReset();
});

afterEach(() => {
  cleanupRenderedNode();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('renders enabled items across supported density variants and triggers the action id', async () => {
  const onTriggerAction = vi.fn();

  for (const density of ['regular', 'compact', 'dense', 'tight'] as const) {
    await renderDensityVariant(density, onTriggerAction);

    const button = getContainer()?.querySelector('button');
    expect(button?.title).toBe('display:' + density + ' • Visible page • Ctrl+Shift+K');
    expectDensityMeta(density);

    act(() => {
      button?.click();
    });
  }

  expect(onTriggerAction).toHaveBeenNthCalledWith(1, 'regular');
  expect(onTriggerAction).toHaveBeenNthCalledWith(2, 'compact');
  expect(onTriggerAction).toHaveBeenNthCalledWith(3, 'dense');
  expect(onTriggerAction).toHaveBeenNthCalledWith(4, 'tight');
  expect(dynamicIconSpy).toHaveBeenLastCalledWith({
    color: 'var(--sniptale-color-text-secondary)',
    name: 'Camera',
  });
});

it('renders disabled items with the disabled title and blocks triggering', async () => {
  const onTriggerAction = vi.fn();

  await renderNode(
    <QuickActionListItem
      action={createQuickAction({ id: 'disabled-action' })}
      presets={[]}
      density="tight"
      disabledTitle="Quick actions unavailable"
      onTriggerAction={onTriggerAction}
    />
  );

  const button = getContainer()?.querySelector('button');

  expect(button?.disabled).toBe(true);
  expect(button?.title).toBe(
    'display:disabled-action • Visible page • Ctrl+Shift+K • Quick actions unavailable'
  );

  act(() => {
    button?.click();
  });

  expect(onTriggerAction).not.toHaveBeenCalled();
  expect(dynamicIconSpy).toHaveBeenCalledWith({
    color: 'var(--sniptale-color-text-dim)',
    name: 'Camera',
  });
});

it('omits the trailing hotkey chip when the quick action has no assigned shortcut', async () => {
  await renderNode(
    <QuickActionListItem
      action={{
        ...createQuickAction({ id: 'no-hotkey' }),
        hotkey: null,
      }}
      presets={[]}
      density="regular"
      onTriggerAction={vi.fn()}
    />
  );

  expect(getContainer()?.textContent).not.toContain('Ctrl+Shift+K');
});
