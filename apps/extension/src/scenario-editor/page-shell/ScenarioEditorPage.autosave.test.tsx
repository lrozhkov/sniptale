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
const io = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  request: vi.fn(),
  session: vi.fn(),
}));
vi.mock('./runtime/ai-request', () => ({
  loadGuideAiConfiguration: async () => ({ providers: [], models: [], defaultModelId: 'model' }),
  requestGuideAiProposal: io.request,
  verifyGuideAiBasis: async () => 1,
  GuideAiStaleError: class extends Error {},
}));
vi.mock('./runtime/resource-session', () => ({ useGuideResourceSession: () => enterSession }));
const enterSession = (projectId: string | null) => io.session(projectId);
vi.mock('../../composition/persistence/scenario/history', () => ({
  getScenarioSavedVersions: async () => {
    const project = await io.load();
    return project
      ? { currentRevision: 1, versions: [{ project, revision: 1, savedAt: 100 }] }
      : null;
  },
}));
vi.mock('../../composition/persistence/scenario/store/project-records/assets', () => ({
  getScenarioAssetBlob: vi.fn(),
}));
vi.mock('../../composition/persistence/scenario/store/public', () => ({
  getScenarioAssetBlob: vi.fn(),
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
import { GUIDE_AUTOSAVE_IDLE_MS } from './runtime/autosave';
import { ScenarioEditorPage } from './ScenarioEditorPage';
import { clickGuideControl } from './test-support/guide-controls';
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  window.history.replaceState({}, '', '/?projectId=guide');
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const project = createGuideProject('Local guide', 'guide', 100);
  project.items.push(createGuideStep('Step', 'step'));
  project.tour = createTourDocument();
  io.load.mockReset();
  io.load.mockResolvedValue(project);
  io.session.mockReset();
  io.session.mockResolvedValue(true);
  io.save.mockReset();
  io.request.mockReset();
  io.request.mockResolvedValue({ baseRevision: 3, changes: [] });
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
    await clickGuideControl('Add step', host);
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
  vi.useRealTimers();
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
  await act(async () => vi.advanceTimersByTimeAsync(GUIDE_AUTOSAVE_IDLE_MS));
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

async function changeProjectName(name: string, selector = 'input[aria-label="Scenario"]') {
  const field = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
  await act(async () => {
    const prototype =
      field instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(field, name);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

it('opens AI during a pending autosave and sends the latest draft once using the acknowledged revision', async () => {
  let release!: () => void;
  io.save.mockImplementationOnce(
    (source) =>
      new Promise((resolve) => {
        release = () => resolve({ ...source, updatedAt: 101 });
      })
  );
  io.save.mockImplementation(async (source) => ({ ...source, updatedAt: 102 }));
  await act(async () => root.render(<ScenarioEditorPage />));
  await changeProjectName('Earlier draft');
  await settle();
  await changeProjectName('Latest draft');
  const ai = host.querySelector<HTMLButtonElement>('[title="AI assistance"]')!;
  expect(ai.disabled).toBe(false);
  await act(async () => ai.click());
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  const send = [...document.querySelectorAll('button')].find(
    (node) => node.textContent === 'Get suggestions'
  )!;
  await act(async () => {
    send.click();
    send.click();
  });
  expect(io.request).not.toHaveBeenCalled();
  await act(async () => release());
  expect(io.save).toHaveBeenCalledTimes(2);
  expect(io.save).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Latest draft' }), {
    baseUpdatedAt: 101,
  });
  expect(io.request).toHaveBeenCalledOnce();
  expect(io.request).toHaveBeenCalledWith(
    expect.objectContaining({
      project: expect.objectContaining({ name: 'Latest draft', updatedAt: 102 }),
    })
  );
  expect(document.querySelector('[role="alert"]')).toBeNull();
});

it('flushes a field boundary immediately while keeping continuous input coalesced', async () => {
  await act(async () => root.render(<ScenarioEditorPage />));
  await changeProjectName('Completed field');
  expect(io.save).not.toHaveBeenCalled();
  const field = host.querySelector<HTMLInputElement>('input[aria-label="Scenario"]')!;
  await act(async () => field.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  expect(io.save).toHaveBeenCalledOnce();
  expect(io.save).toHaveBeenCalledWith(expect.objectContaining({ name: 'Completed field' }), {
    baseUpdatedAt: 100,
  });
});

it('keeps typing available during autosave and uses the acknowledged revision for newer content', async () => {
  let finish: (() => void) | undefined;
  io.save.mockImplementationOnce(
    (project) =>
      new Promise((resolve) => {
        finish = () => resolve({ ...project, updatedAt: 101 });
      })
  );
  await act(async () => root.render(<ScenarioEditorPage />));
  await changeProjectName('First draft', 'article#step .guide-step-title');
  await settle();
  expect(host.querySelector('.guide-page-feedback')).toBeNull();
  expect(io.save).toHaveBeenCalledTimes(1);
  expect(host.querySelector('article .guide-step-title')).toHaveProperty('disabled', false);
  await changeProjectName('More recent draft', 'article#step .guide-step-title');
  await act(async () => finish?.());
  expect(host.querySelector('article .guide-step-title')).toHaveProperty(
    'value',
    'More recent draft'
  );
  io.save.mockImplementation(async (project) => ({ ...project, updatedAt: 102 }));
  await settle();
  expect(io.save).toHaveBeenCalledTimes(2);
  expect(io.save).toHaveBeenLastCalledWith(
    expect.objectContaining({ items: [expect.objectContaining({ title: 'More recent draft' })] }),
    { baseUpdatedAt: 101 }
  );
  await clickGuideControl('Undo', host);
  expect(host.querySelector('article .guide-step-title')).toHaveProperty('value', 'Step');
});

it('protects a closing page until its latest edit is durable and does not autosave acknowledgments', async () => {
  await act(async () => root.render(<ScenarioEditorPage />));
  expect([...host.querySelectorAll('button')].some((button) => button.textContent === 'Save')).toBe(
    false
  );
  await changeProjectName('Last edit', 'article#step .guide-step-title');
  const pendingClose = new Event('beforeunload', { cancelable: true });
  await act(async () => window.dispatchEvent(pendingClose));
  expect(pendingClose.defaultPrevented).toBe(true);
  await settle();
  const savedClose = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(savedClose);
  expect(savedClose.defaultPrevented).toBe(false);
  expect(io.save).toHaveBeenCalledTimes(1);
});

it.each(['failed', 'conflict'] as const)(
  'protects a %s draft while confirmed reload is pending',
  async (status) => {
    const error = new Error('Save rejected');
    if (status === 'conflict') error.name = 'StaleScenarioAggregateRevisionError';
    io.save.mockRejectedValue(error);
    await act(async () => root.render(<ScenarioEditorPage />));
    await clickGuideControl('Add step', host);
    await settle();
    io.load.mockImplementationOnce(() => new Promise(() => {}));
    await confirmRecoveryReload();
    expect(host.querySelectorAll('article')).toHaveLength(2);
    const closing = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(closing);
    expect(closing.defaultPrevented).toBe(true);
  }
);

it.each([
  ['failed', 'rejected'],
  ['conflict', 'rejected'],
  ['failed', 'missing'],
  ['conflict', 'missing'],
  ['failed', 'refused'],
  ['conflict', 'refused'],
] as const)('retains a %s draft after a %s reload', async (status, outcome) => {
  const error = new Error('Save rejected');
  if (status === 'conflict') error.name = 'StaleScenarioAggregateRevisionError';
  io.save.mockRejectedValue(error);
  await act(async () => root.render(<ScenarioEditorPage />));
  await clickGuideControl('Add step', host);
  await settle();
  if (outcome === 'rejected') io.load.mockRejectedValueOnce(new Error('Load rejected'));
  else if (outcome === 'missing') io.load.mockResolvedValueOnce(null);
  else io.session.mockResolvedValueOnce(false);
  await confirmRecoveryReload();
  expect(host.querySelectorAll('article')).toHaveLength(2);
  expect(host.querySelector('.guide-page-feedback')?.getAttribute('data-status')).toBe(status);
  const closing = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(closing);
  expect(closing.defaultPrevented).toBe(true);
  await settle();
  expect(io.save).toHaveBeenCalledTimes(1);
  await confirmRecoveryReload();
  expect(host.querySelectorAll('article')).toHaveLength(1);
  const recoveredClose = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(recoveredClose);
  expect(recoveredClose.defaultPrevented).toBe(false);
  expect(host.querySelector('.guide-page-feedback')).toBeNull();
});

async function confirmRecoveryReload() {
  const recovery = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === 'Reload project'
  );
  if (!recovery) throw new Error('Missing reload recovery');
  await act(async () => recovery.click());
  const confirm = [
    ...document.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button'),
  ].find((button) => button.textContent === 'Reload project');
  if (!confirm) throw new Error('Missing reload confirmation');
  await act(async () => confirm.click());
}
