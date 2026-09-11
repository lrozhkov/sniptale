// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createGuideProject, createGuideStep } from '../../features/scenario/project/public';
import { createTranslator } from '../../platform/i18n';
const io = vi.hoisted(() => ({ load: vi.fn(), restore: vi.fn(), clear: vi.fn() }));
vi.mock('../../composition/persistence/scenario/history', () => ({
  getScenarioSavedVersions: io.load,
}));
vi.mock('./runtime/use-state', () => ({ useGuideImages: () => ({}) }));
vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  useAppLocale: () => 'en',
}));
import { GuideSavedHistory } from './saved-history';
let host: HTMLDivElement;
let root: Root;
const previous = createGuideProject('Previous guide', 'guide', 1);
previous.items.push(createGuideStep('Earlier step', 'step'));
const current = { ...previous, name: 'Current guide', updatedAt: 2 };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  io.load.mockResolvedValue({
    currentRevision: 2,
    versions: [
      { revision: 2, savedAt: 2, project: current },
      { revision: 1, savedAt: 1, project: previous },
    ],
  });
  io.restore.mockResolvedValue(true);
  io.clear.mockResolvedValue(true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function render(canClearHistory = true) {
  await act(async () =>
    root.render(
      <GuideSavedHistory
        project={current}
        disabled={false}
        onRestore={io.restore}
        onClearHistory={io.clear}
        canClearHistory={canClearHistory}
        t={createTranslator('en')}
      />
    )
  );
}
async function click(label: string, scope: ParentNode = host) {
  const button = [...scope.querySelectorAll('button')].find((item) => item.textContent === label);
  if (!button) throw new Error(`Missing ${label}`);
  await act(async () => button.click());
}
async function choosePrevious() {
  const select = host.querySelector('select');
  if (!select) throw new Error('Missing versions');
  await act(async () => {
    select.value = '1';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
it('loads only when opened and previews stored content before a confirmed restore', async () => {
  await render();
  expect(io.load).not.toHaveBeenCalled();
  await click('Saved versions');
  expect(host.querySelector('select')?.options).toHaveLength(2);
  await choosePrevious();
  expect(host.querySelector('.guide-history-preview')?.textContent).toContain('Previous guide');
  expect(host.querySelector('.guide-history-preview')?.textContent).toContain('Earlier step');
  await click('Restore as a new version');
  expect(io.restore).not.toHaveBeenCalled();
  const dialog = document.querySelector('[role="alertdialog"]');
  if (!dialog) throw new Error('Missing confirmation');
  await click('Cancel', dialog);
  expect(io.restore).not.toHaveBeenCalled();
  await click('Restore as a new version');
  const confirmation = document.querySelector('[role="alertdialog"]');
  if (!confirmation) throw new Error('Missing confirmation');
  await click('Restore as a new version', confirmation);
  expect(io.restore).toHaveBeenCalledWith(1);
});
it('keeps preview and reports failure without claiming a successful restore', async () => {
  await render();
  await click('Saved versions');
  await choosePrevious();
  io.restore.mockResolvedValueOnce(false);
  await click('Restore as a new version');
  const dialog = document.querySelector('[role="alertdialog"]');
  if (!dialog) throw new Error('Missing confirmation');
  await click('Restore as a new version', dialog);
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Your current edits remain');
  expect(host.querySelector('.guide-history-preview')?.textContent).toContain('Previous guide');
});
it('shows a load error and reloads committed history on explicit retry', async () => {
  io.load.mockRejectedValueOnce(new Error('unavailable'));
  await render();
  await click('Saved versions');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Could not load');
  await click('Retry loading');
  expect(host.querySelector('select')?.options).toHaveLength(2);
});

it('requires saved content and confirmation before clearing durable versions', async () => {
  await render(false);
  await click('Saved versions');
  const button = [...host.querySelectorAll('button')].find(
    (item) => item.textContent === 'Clear saved history'
  );
  expect(button?.disabled).toBe(true);
  expect(host.textContent).toContain('Save your changes before clearing history.');
  await render();
  await click('Clear saved history');
  expect(io.clear).not.toHaveBeenCalled();
  const dialog = document.querySelector('[role="alertdialog"]');
  if (!dialog) throw new Error('Missing confirmation');
  expect(dialog.textContent).toContain('open tabs');
  await click('Cancel', dialog);
  expect(io.clear).not.toHaveBeenCalled();
  await click('Clear saved history');
  io.clear.mockResolvedValueOnce(false);
  const next = document.querySelector('[role="alertdialog"]');
  if (!next) throw new Error('Missing confirmation');
  await click('Clear saved history', next);
  expect(io.clear).toHaveBeenCalledOnce();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Could not clear history');
  expect(host.querySelector('select')?.options).toHaveLength(2);
});
