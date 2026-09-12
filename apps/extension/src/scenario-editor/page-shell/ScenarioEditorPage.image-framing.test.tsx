// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createGuideImageBlock,
  createGuideProject,
  createGuideStep,
} from '../../features/scenario/project/factories';

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

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  io.previous.mockReturnValue([]);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  window.history.replaceState({}, '', '/?projectId=guide');
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const project = createGuideProject('Local guide', 'guide', 100);
  project.items.push(createGuideStep('First step', 'first'));
  io.load.mockResolvedValue(project);
  io.asset.mockResolvedValue(undefined);
  io.save.mockImplementation(async (value) => ({ ...value, updatedAt: 101 }));
  io.duplicate.mockImplementation(async (value, name) => ({
    ...value,
    id: 'copy',
    name,
    updatedAt: 102,
  }));
  io.remove.mockResolvedValue(undefined);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function render() {
  await act(async () => root.render(<ScenarioEditorPage />));
}
async function click(label: string, scope: ParentNode = container) {
  const button = [...scope.querySelectorAll('button')].find(
    (entry) => (entry.getAttribute('aria-label') ?? entry.textContent) === label
  );
  if (!button) throw new Error(`Missing ${label}`);
  await act(async () => button.click());
}
async function editField(selector: string, value: string) {
  const field = container.querySelector<HTMLInputElement>(selector);
  if (!field) throw new Error('Missing field');
  await act(async () => {
    field.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function settleAutosave() {
  await act(async () => new Promise((resolve) => setTimeout(resolve, 900)));
}
it('moves framing into one contextual inspector and keeps it bound through canonical edits', async () => {
  const project = createGuideProject('Images', 'guide', 100);
  const step = createGuideStep('Image step', 'images');
  step.blocks = ['one', 'two'].map((id) =>
    createGuideImageBlock({
      id,
      assetId: 'asset',
      width: 800,
      height: 600,
      source: { kind: 'import', filename: `${id}.png` },
    })
  );
  project.items = [step, createGuideStep('Other step', 'other')];
  io.load.mockResolvedValue(project);
  io.asset.mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = vi.fn(() => 'blob:guide-image');
      static revokeObjectURL = vi.fn();
    }
  );
  await render();
  const first = container.querySelector('[data-block-id="one"]')!;
  const second = container.querySelector('[data-block-id="two"]')!;
  const inspector = container.querySelector('#guide-inspector-panel')!;
  await click('Frame and image', first);
  expect(inspector.hasAttribute('hidden')).toBe(false);
  expect(first.querySelector('.guide-image-controls')).toBeNull();
  expect(inspector.querySelector('.guide-image-controls')).not.toBeNull();
  await editField('#guide-inspector-panel .guide-image-description input', 'Current caption');
  expect(first.querySelector('figcaption')?.textContent).toBe('Current caption');
  expect(first.querySelector('figure')?.getAttribute('data-editing')).toBe('true');
  await settleAutosave();
  expect(first.querySelector('figure')?.getAttribute('data-editing')).toBe('true');
  await click('Frame and image', second);
  expect(first.querySelector('figure')?.getAttribute('data-editing')).toBe('false');
  expect(second.querySelector('figure')?.getAttribute('data-editing')).toBe('true');
  expect(inspector.querySelector<HTMLInputElement>('.guide-image-description input')?.value).toBe(
    ''
  );
  await click('Close', inspector);
  expect(inspector.hasAttribute('hidden')).toBe(true);
  await click('Inspector');
  expect(second.querySelector('figure')?.getAttribute('data-editing')).toBe('true');
  await act(async () =>
    inspector
      .querySelector('input')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  );
  expect(inspector.querySelector('.guide-image-controls')).toBeNull();
  expect(document.activeElement).toBe(second.querySelector('[data-frame-image]'));
  await click('Frame and image', second);
  const other = container.querySelector<HTMLElement>('article#other')!;
  await act(async () => other.focus());
  expect(inspector.querySelector('.guide-image-controls')).toBeNull();
  expect(second.querySelector('figure')?.getAttribute('data-editing')).toBe('false');
});

it('selects text and note settings from focus, preserves edits and returns to step settings', async () => {
  const project = createGuideProject('Blocks', 'guide', 100);
  const step = createGuideStep('Step', 'blocks');
  step.blocks = [
    {
      kind: 'text',
      id: 'text',
      paragraphs: [{ runs: [{ text: 'Body', bold: false, italic: false, href: null }] }],
    },
    { kind: 'note', id: 'note', tone: 'info', paragraphs: [] },
  ];
  project.items = [step];
  io.load.mockResolvedValue(project);
  await render();
  const inspector = container.querySelector('#guide-inspector-panel')!;
  const text = container.querySelector<HTMLTextAreaElement>('[data-block-id="text"] textarea')!;
  await act(async () => text.focus());
  expect(inspector.textContent).toContain('Block width');
  expect(inspector.textContent).not.toContain('Restart numbering');
  await click('Half width', inspector);
  expect(container.querySelector('[data-block-id="text"]')?.getAttribute('data-width')).toBe(
    'half'
  );
  await click('Undo');
  expect(container.querySelector('[data-block-id="text"]')?.getAttribute('data-width')).toBe(
    'full'
  );
  await act(async () =>
    container.querySelector<HTMLTextAreaElement>('[data-block-id="note"] textarea')!.focus()
  );
  expect(inspector.textContent).toContain('Note type');
  await click('Warning', inspector);
  expect(container.querySelector('[data-block-id="note"] aside')?.getAttribute('data-tone')).toBe(
    'warning'
  );
  await click('Step settings', inspector);
  expect(inspector.textContent).toContain('Restart numbering');
  expect(document.activeElement).toBe(container.querySelector('.guide-step-title'));
  await act(async () => text.focus());
  const outline = container.querySelector<HTMLAnchorElement>('.guide-outline a')!;
  await act(async () => outline.click());
  expect(inspector.textContent).toContain('Restart numbering');
  await act(async () => text.focus());
  await click('Block actions', container.querySelector('[data-block-id="text"]')!);
  await click('Remove block', document.body);
  expect(container.querySelector('[data-block-id="text"]')).toBeNull();
  expect(inspector.textContent).toContain('Restart numbering');
  await click('Undo');
  expect(container.querySelector('[data-block-id="text"]')).not.toBeNull();
  expect(inspector.textContent).toContain('Restart numbering');
});
