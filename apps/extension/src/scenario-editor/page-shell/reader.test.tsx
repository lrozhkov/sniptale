// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import {
  createGuideProject,
  createGuideStep,
  createGuideParagraphs,
} from '../../features/scenario/project/public';
import { createTranslator } from '../../platform/i18n';
import { GuideReader } from './reader';

const io = vi.hoisted(() => ({
  load: vi.fn(),
  previous: vi.fn(),
  asset: vi.fn(),
  create: vi.fn(),
  duplicate: vi.fn(),
  remove: vi.fn(),
  save: vi.fn(),
  importImages: vi.fn(),
  select: vi.fn(),
  mount: vi.fn(),
}));
vi.mock('./runtime/resource-session', () => ({ useGuideResourceSession: () => enterSession }));
const enterSession = async () => true;
vi.mock('../../composition/persistence/scenario/history', () => ({
  getScenarioSavedVersions: async (id: string) => {
    const project = await io.load(id);
    return project
      ? {
          currentRevision: 1,
          versions: [
            { project, revision: 1, savedAt: project.updatedAt },
            ...(io.previous() ?? []),
          ],
        }
      : null;
  },
}));
vi.mock('../../composition/persistence/scenario/store/project-records/assets', () => ({
  getScenarioAssetBlob: io.asset,
}));
vi.mock('../../composition/persistence/scenario/store/public', () => ({
  createScenarioProjectRecord: io.create,
  duplicateScenarioProjectRecord: io.duplicate,
  deleteScenarioProjectRecord: io.remove,
  saveScenarioProjectRecord: io.save,
  importScenarioImages: io.importImages,
}));
vi.mock('../platform/browser-driver', () => ({ replaceScenarioEditorSelectionInUrl: io.select }));
vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  useAppLocale: () => 'en',
}));
vi.mock('../../ui/page-bootstrap', () => ({ renderPageShell: io.mount }));
import { ScenarioEditorPage } from './ScenarioEditorPage';

it('navigates bounded reading pages without changing the canonical document', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const project = createGuideProject('Guide');
  project.items = [
    {
      kind: 'section',
      id: 'intro',
      title: 'Introduction',
      paragraphs: createGuideParagraphs('Read first'),
    },
    createGuideStep('Step', 'step'),
    createGuideStep('Second', 'second'),
  ];
  const original = structuredClone(project);
  const close = vi.fn();
  const button = (name: string) => {
    const node = [...host.querySelectorAll('button')].find(
      (node) => (node.getAttribute('aria-label') ?? node.textContent) === name
    );
    if (!node) throw new Error(`Missing ${name}`);
    return node;
  };
  try {
    await act(async () =>
      root.render(
        <GuideReader
          onChange={() => {}}
          project={project}
          images={{}}
          initialId="step"
          onClose={close}
          t={createTranslator('en')}
        />
      )
    );
    expect(document.activeElement).toBe(button('Back to editing'));
    expect(host.querySelectorAll('.guide-read-document > *')).toHaveLength(3);
    await act(async () => button('Step by step').click());
    expect(host.querySelectorAll('.guide-read-document > *')).toHaveLength(2);
    expect(button('Next step').disabled).toBe(false);
    await act(async () => button('Next step').click());
    expect(host.querySelector('.guide-read-document section')).toBeNull();
    expect(button('Next step').disabled).toBe(true);
    await act(async () => button('Previous step').click());
    expect(host.querySelector('.guide-read-document section')?.id).toBe('intro');
    expect(button('Previous step').disabled).toBe(true);
    await act(async () =>
      button('Previous step').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
      )
    );
    expect(host.querySelector('.guide-read-document article')?.id).toBe('second');
    await act(async () => button('Document').click());
    expect(host.querySelectorAll('.guide-read-document > *')).toHaveLength(3);
    await act(async () => host.querySelector('a')!.click());
    expect(host.querySelector('a')?.getAttribute('aria-current')).toBe('step');
    await act(async () =>
      button('Back to editing').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      )
    );
    expect(close).toHaveBeenCalledOnce();
    expect(project).toEqual(original);
    await act(async () =>
      root.render(
        <GuideReader
          onChange={() => {}}
          project={createGuideProject('Empty')}
          images={{}}
          initialId={null}
          onClose={close}
          t={createTranslator('en')}
        />
      )
    );
    expect(host.querySelector('[role="status"]')?.textContent).toBe('This guide has no steps yet');
    await act(async () => button('Step by step').click());
    expect(button('Previous step').disabled).toBe(true);
    expect(button('Next step').disabled).toBe(true);
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it('enters and leaves reading without reloading or saving the project', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const project = createGuideProject('Guide', 'guide');
  project.items = [createGuideStep('First', 'first')];
  io.load.mockResolvedValue(project);
  io.previous.mockReturnValue([]);
  io.save.mockImplementation(async (value) => value);
  window.history.replaceState({}, '', '/?projectId=guide&stepId=first');
  const button = (label: string) => {
    const node = [...host.querySelectorAll('button')].find(
      (node) => node.getAttribute('aria-label') === label
    );
    if (!node) throw new Error(`Missing ${label}`);
    return node;
  };
  try {
    await act(async () => root.render(<ScenarioEditorPage />));
    const loads = io.load.mock.calls.length;
    const saves = io.save.mock.calls.length;
    await act(async () => button('Export').click());
    expect(host.querySelector('.guide-reader')).not.toBeNull();
    await act(async () => button('Back to editing').click());
    expect(host.querySelector('.guide-reader')).toBeNull();
    expect(document.activeElement).toBe(button('Export'));
    expect(host.querySelector('article[data-selected="true"]')?.id).toBe('first');
    expect(io.load.mock.calls.length).toBe(loads);
    expect(io.save.mock.calls.length).toBe(saves);
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it('keeps export activation available during a pending autosave', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const project = createGuideProject('Guide', 'guide');
  project.items = [createGuideStep('First', 'first')];
  io.load.mockResolvedValue(project);
  io.previous.mockReturnValue([]);
  let complete: ((value: typeof project) => void) | undefined;
  io.save.mockReset().mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      })
  );
  window.history.replaceState({}, '', '/?projectId=guide&stepId=first');
  try {
    await act(async () => root.render(<ScenarioEditorPage />));
    const input = host.querySelector<HTMLInputElement>('input[aria-label="Scenario"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input,
        'Edited guide'
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(400);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(io.save).toHaveBeenCalledOnce();
    const exportButton = host.querySelector<HTMLButtonElement>('button[aria-label="Export"]')!;
    expect(exportButton.disabled).toBe(false);
    await act(async () => exportButton.click());
    expect(host.querySelector('.guide-reader')).not.toBeNull();
    await act(async () =>
      complete?.({ ...project, name: 'Edited guide', updatedAt: project.updatedAt + 1 })
    );
    expect(host.querySelector('.guide-reader')).not.toBeNull();
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
