// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { quickActionListItemSpy } = vi.hoisted(() => ({
  quickActionListItemSpy: vi.fn(),
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
  DynamicIcon: (props: { name: string }) => <span data-testid="dynamic-icon">{props.name}</span>,
  IDLE_RECORDING_STATE: null,
  PopupPage: undefined,
  describeCaptureSource: vi.fn(),
  formatDuration: vi.fn(),
  formatHotkeyShort: () => 'Ctrl+Shift+K',
  getCaptureModeLabels: vi.fn(),
  getQuickActionColor: vi.fn(),
  getQuickActionMeta: () => 'Visible page',
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

vi.mock('./block-items/item', () => ({
  QuickActionListDensity: undefined,
  QuickActionListItem: (props: unknown) => {
    quickActionListItemSpy(props);
    return <div data-testid="quick-action-item" />;
  },
}));

import { QuickActionsBlock } from './block';
import { QuickActionListItem } from './block-items/item';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createQuickAction(id: string, overrides: Record<string, unknown> = {}) {
  return {
    exitAfterCapture: false,
    icon: 'Camera',
    id,
    name: id,
    screenshotMode: 'visible',
    status: true,
    ...overrides,
  };
}

async function renderNode(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(node);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  quickActionListItemSpy.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('omits the disabled title when the quick-action block remains interactive', async () => {
  await renderNode(
    <QuickActionsBlock
      actions={[createQuickAction('action-1')] as never}
      displayMode="list"
      presets={[]}
      onTriggerAction={vi.fn()}
    />
  );

  expect(quickActionListItemSpy).toHaveBeenCalledWith({
    action: createQuickAction('action-1'),
    density: 'regular',
    onTriggerAction: expect.any(Function),
    presets: [],
  });
});

it('hides the hotkey chip when a quick action has no hotkey', async () => {
  await renderNode(
    <QuickActionListItem
      action={createQuickAction('no-hotkey', { hotkey: null }) as never}
      presets={[]}
      density="regular"
      onTriggerAction={vi.fn()}
    />
  );

  expect(container?.textContent).not.toContain('Ctrl+Shift+K');
});
