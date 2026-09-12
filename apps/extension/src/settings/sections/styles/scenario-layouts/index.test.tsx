// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { ScenarioLayoutsSection } from '.';
const io = vi.hoisted(() => ({ list: vi.fn(), save: vi.fn(), remove: vi.fn(), open: vi.fn() }));
vi.mock('../../../../composition/persistence/scenario/store/public', () => ({
  listScenarioStepTemplates: io.list,
  saveScenarioStepTemplate: io.save,
  deleteScenarioProjectRecord: io.remove,
}));
vi.mock('../../../../platform/navigation/extension-pages', () => ({
  openScenarioEditorPage: io.open,
}));
vi.mock('../../../../features/media-hub/events', () => ({
  subscribeToMediaHubEvents: () => () => {},
}));
vi.mock('../../../../platform/i18n', async (original) => {
  const actual = await original<typeof import('../../../../platform/i18n')>();
  return { ...actual, useAppLocale: () => 'en', translate: actual.createTranslator('en') };
});
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  io.list.mockResolvedValue([
    { id: 'template', name: 'Reusable', availability: 'available', purpose: 'step-template' },
  ]);
  io.save.mockImplementation(async (project) => ({ ...project, id: 'new-template' }));
  io.open.mockResolvedValue(undefined);
  io.remove.mockResolvedValue(undefined);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function mount() {
  await act(async () => root.render(<ScenarioLayoutsSection />));
}
async function click(label: string) {
  const scope = document.querySelector('[role="dialog"], [role="alertdialog"]') ?? document;
  const button = [...scope.querySelectorAll('button')].find(
    (node) => (node.getAttribute('aria-label') ?? node.textContent) === label
  );
  if (!button) throw new Error(`Missing ${label}`);
  await act(async () => button.click());
}
it('lists saved layouts and opens them in the same editor for name and content editing', async () => {
  await mount();
  expect(host.textContent).toContain('Reusable');
  await click('Edit');
  expect(io.open).toHaveBeenCalledWith('template');
});
it('creates exactly one editable step before opening the new layout', async () => {
  await mount();
  await click('Create layout');
  const [project, stepId, name] = io.save.mock.calls[0]!;
  expect(project.items).toHaveLength(1);
  expect(project.items[0]).toMatchObject({ id: stepId, kind: 'step' });
  expect(name).toBe('New layout');
  expect(io.open).toHaveBeenCalledWith('new-template', stepId);
});
it('shows catalog unavailability and retries without hiding it as an empty collection', async () => {
  io.list.mockRejectedValueOnce(new Error('Unavailable'));
  await mount();
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  await click('Retry loading');
  expect(host.textContent).toContain('Reusable');
});

it('requires confirmation for deletion and leaves failed deletion retryable', async () => {
  await mount();
  const openDelete = async () => {
    const trigger = host.querySelector<HTMLButtonElement>(
      '[data-settings-collection-item="template"] button[data-collection-inline-action="delete"]'
    );
    if (!trigger) throw new Error('Missing row menu');
    await act(async () => trigger.click());
  };
  await openDelete();
  expect(io.remove).not.toHaveBeenCalled();
  await click('Cancel');
  expect(io.remove).not.toHaveBeenCalled();
  await openDelete();
  io.remove.mockRejectedValueOnce(new Error('Unavailable'));
  await click('Delete');
  expect(document.querySelector('[role="dialog"], [role="alertdialog"]')?.textContent).toContain(
    'Could not complete the layout action'
  );
  await click('Delete');
  expect(io.remove).toHaveBeenCalledTimes(2);
  expect(document.querySelector('[role="dialog"], [role="alertdialog"]')).toBeNull();
});

it('keeps a newer catalog refresh when the initial request arrives late', async () => {
  let resolveFirst!: (entries: unknown[]) => void;
  io.list.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveFirst = resolve;
      })
  );
  await mount();
  io.list.mockResolvedValue([{ id: 'latest', name: 'Latest layout', availability: 'available' }]);
  await act(async () => window.dispatchEvent(new Event('focus')));
  await act(async () =>
    resolveFirst([{ id: 'old', name: 'Obsolete layout', availability: 'available' }])
  );
  expect(host.textContent).toContain('Latest layout');
  expect(host.textContent).not.toContain('Obsolete layout');
});
