// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { cleanupRenderedNode, renderNode } from '../popup-home.test.helpers';

const { quickActionsBlockSpy } = vi.hoisted(() => ({
  quickActionsBlockSpy: vi.fn(),
}));

vi.mock('../../../../../platform/i18n/popup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n/popup')>()),
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
  quickActionsBlockSpy.mockReset();
});

afterEach(() => {
  cleanupRenderedNode();
  vi.restoreAllMocks();
});

it('hides the quick-actions section entirely when it should not be shown', async () => {
  await renderNode(
    <PopupHomeQuickActions
      shouldShowQuickActions={false}
      quickActionsReady
      hasQuickActions
      quickActions={[{ id: 'action-1' } as never]}
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
      viewportPresets={[]}
      onTriggerAction={vi.fn()}
    />
  );

  expect(quickActionsBlockSpy).toHaveBeenCalledWith({
    actions: [action],
    isActionPageIndependent: expect.any(Function),
    onTriggerAction: expect.any(Function),
    presets: [],
  });
});
