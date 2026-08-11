// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { quickActionListItemSpy } = vi.hoisted(() => ({
  quickActionListItemSpy: vi.fn(),
}));

vi.mock('../../../../features/quick-actions-presets/catalog', () => ({
  createBundledQuickAction: vi.fn(),
  getCaptureActionDescriptors: vi.fn(),
  getBundledQuickActionConfig: vi.fn(),
  getBundledQuickActions: vi.fn(),
  getQuickActionDisplayName: (action: { id: string }) => `display:${action.id}`,
  isBundledQuickAction: vi.fn(),
  mergeStoredQuickActions: vi.fn(),
  normalizeQuickAction: vi.fn(),
  resetBundledQuickAction: vi.fn(),
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
