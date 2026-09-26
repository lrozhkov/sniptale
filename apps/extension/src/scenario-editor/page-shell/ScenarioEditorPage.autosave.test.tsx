// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createGuideParagraphs,
  createGuideProject,
  createGuideStep,
  createTourDocument,
} from '../../features/scenario/project/factories';
const io = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock('./runtime/resource-session', () => ({ useGuideResourceSession: () => enterSession }));
const enterSession = async () => true;
vi.mock('../../composition/persistence/scenario/history', () => ({
  getScenarioSavedVersions: async () => ({
    currentRevision: 1,
    versions: [{ project: await io.load(), revision: 1, savedAt: 100 }],
  }),
}));
vi.mock('../../composition/persistence/scenario/store/project-records/assets', () => ({
  getScenarioAssetBlob: vi.fn(),
}));
vi.mock('../../composition/persistence/scenario/store/public', () => ({
  createScenarioProjectRecord: vi.fn(),
  duplicateScenarioProjectRecord: vi.fn(),
  deleteScenarioProjectRecord: vi.fn(),
  saveScenarioProjectRecord: io.save,
  importScenarioImages: vi.fn(),
}));
vi.mock('../platform/browser-driver', () => ({ replaceScenarioEditorSelectionInUrl: vi.fn() }));
vi.mock('../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../platform/i18n')>()),
  useAppLocale: () => 'en',
}));
import { ScenarioEditorPage } from './ScenarioEditorPage';
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  window.history.replaceState({}, '', '/?projectId=guide');
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const project = createGuideProject('Local guide', 'guide', 100);
  project.items.push(createGuideStep('Step', 'step'));
  project.tour = createTourDocument();
  io.load.mockResolvedValue(project);
  io.save.mockReset();
  io.save.mockImplementation(async (value) => ({ ...value, updatedAt: 101 }));
});
it('keeps the information note control mounted and enabled through autosave', async () => {
  const project = createGuideProject('Local guide', 'guide', 100);
  const step = createGuideStep('Step', 'step');
  step.blocks = [
    { kind: 'note', id: 'note', tone: 'info', paragraphs: createGuideParagraphs('Before') },
  ];
  project.items = [step];
  io.load.mockResolvedValue(project);
  let finish!: () => void;
  io.save.mockImplementationOnce(
    (source) =>
      new Promise((resolve) => {
        finish = () => resolve({ ...source, updatedAt: 101 });
      })
  );
  await act(async () => root.render(<ScenarioEditorPage />));
  const button = host.querySelector<HTMLButtonElement>('.guide-note-callout button')!;
  const field = host.querySelector<HTMLTextAreaElement>('.guide-note-callout textarea')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      field,
      'After'
    );
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(host.querySelector('.guide-note-callout button')).toBe(button);
  expect(button.disabled).toBe(false);
  await settle();
  expect(io.save).toHaveBeenCalledOnce();
  expect(host.querySelector('.guide-note-callout button')).toBe(button);
  expect(button.disabled).toBe(false);
  await act(async () => finish());
  expect(host.querySelector('.guide-note-callout button')).toBe(button);
  expect(button.disabled).toBe(false);
});
it.each(['stacked', 'side-by-side', 'comparison', 'text'] as const)(
  'adds a %s step with immediate text editing and no image prompt',
  async (layout) => {
    const project = createGuideProject('Guide', 'guide', 100);
    const step = createGuideStep('First', 'step');
    step.layout = layout;
    project.items = [step];
    io.load.mockResolvedValue(project);
    await act(async () => root.render(<ScenarioEditorPage />));
    await act(async () => host.querySelector<HTMLElement>('article#step')!.focus());
    const add = host.querySelector<HTMLButtonElement>(
      '.guide-insertion-item[data-end="true"] [aria-label="Add step"]'
    )!;
    await act(async () => add.click());
    const added = host.querySelectorAll<HTMLElement>('article')[1]!;
    expect(added.dataset['layout']).toBe(layout);
    expect(added.querySelector('.guide-image-slot')).toBeNull();
    const body = added.querySelector<HTMLTextAreaElement>('.guide-description');
    expect(body).not.toBeNull();
    expect(document.activeElement).toBe(body);
  }
);
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function autosave(enabled: boolean) {
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[data-ui="autosave-control"] button')!.click()
  );
  const toggle = document.querySelector<HTMLInputElement>('[role=switch]')!;
  if (toggle.checked !== enabled) await act(async () => toggle.click());
  await act(async () =>
    toggle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  );
}
async function settle() {
  await act(async () => new Promise((resolve) => setTimeout(resolve, 400)));
}
it('keeps autosave paused across guide/tour switching and saves latest edits on resume', async () => {
  await act(async () => root.render(<ScenarioEditorPage />));
  await autosave(false);
  const modes = host.querySelectorAll<HTMLButtonElement>('.tour-representation-switch button');
  await act(async () => modes[1]!.click());
  expect(
    host.querySelector('[data-ui="autosave-control"] button')?.getAttribute('aria-label')
  ).toContain('Not saving');
  const title = host.querySelector<HTMLInputElement>('input[aria-label="Scenario"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      title,
      'Paused tour title'
    );
    title.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settle();
  expect(io.save).not.toHaveBeenCalled();
  await act(async () =>
    host.querySelectorAll<HTMLButtonElement>('.tour-representation-switch button')[0]!.click()
  );
  await autosave(true);
  await settle();
  expect(io.save).toHaveBeenCalledWith(expect.objectContaining({ name: 'Paused tour title' }), {
    baseUpdatedAt: 100,
  });
});
