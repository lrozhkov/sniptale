// @vitest-environment jsdom
import { createTourDocument, createTourImageSlide } from '../../features/scenario/project/public';
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
  tourEdit: vi.fn(),
  narration: vi.fn(),
}));
vi.mock('../../workflows/scenario-capture-edit/tour-edits', () => ({
  applyTourImageEdit: io.tourEdit,
}));
vi.mock('./image-editor', async (original) => ({
  ...(await original<typeof import('./image-editor')>()),
  TourImageEditor: ({
    slideId,
    onApply,
    onClose,
  }: {
    slideId: string;
    onApply: (input: unknown) => Promise<unknown>;
    onClose: () => void;
  }) => (
    <button
      data-embedded-slide={slideId}
      onClick={() => void onApply({ target: { slideId } }).then(onClose)}
    >
      Apply tour image
    </button>
  ),
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
  importScenarioNarration: io.narration,
  getScenarioAssetBlob: io.asset,
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
    (entry) =>
      (entry.getAttribute('aria-label') ?? entry.getAttribute('title') ?? entry.textContent) ===
      label
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
      .querySelector('.guide-image-description input')
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
  expect(inspector.querySelector('[aria-label="Block width"]')).not.toBeNull();
  expect(inspector.textContent).not.toContain('Restart numbering');
  await click('Half width', inspector);
  expect(container.querySelector('[data-block-id="text"]')?.getAttribute('data-width')).toBe('50');
  await click('Undo');
  expect(container.querySelector('[data-block-id="text"]')?.getAttribute('data-width')).toBe('100');
  await act(async () =>
    container.querySelector<HTMLTextAreaElement>('[data-block-id="note"] textarea')!.focus()
  );
  expect(inspector.textContent).toContain('Note type');
  await click('Note type', inspector);
  await click('Warning', document.body);
  expect(container.querySelector('[data-block-id="note"] aside')?.getAttribute('data-tone')).toBe(
    'warning'
  );
  await click('Step settings', inspector);
  expect(inspector.textContent).toContain('Step layout');
  expect(document.activeElement).toBe(container.querySelector('.guide-step-title'));
  await act(async () => text.focus());
  const outline = container.querySelector<HTMLAnchorElement>('.guide-outline a')!;
  await act(async () => outline.click());
  expect(inspector.textContent).toContain('Step layout');
  await act(async () => text.focus());
  await click('Block actions', container.querySelector('[data-block-id="text"]')!);
  await click('Remove block', document.body);
  expect(container.querySelector('[data-block-id="text"]')).toBeNull();
  expect(inspector.textContent).toContain('Step layout');
  await click('Undo');
  expect(container.querySelector('[data-block-id="text"]')).not.toBeNull();
  expect(inspector.textContent).toContain('Step layout');
});

it('opens the selected tour image and restores its selection and focus after Apply', async () => {
  const project = createGuideProject('Tour', 'guide', 100);
  const first = createTourImageSlide('first');
  const second = createTourImageSlide('second');
  second.image = {
    assetId: 'image',
    width: 100,
    height: 100,
    alt: '',
    galleryAssetId: null,
    editDocumentId: null,
    source: { kind: 'import', filename: 'image.png' },
  };
  project.tour = { ...createTourDocument(), slides: [first, second] };
  io.load.mockResolvedValue(project);
  io.asset.mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
  io.tourEdit.mockResolvedValue({ status: 'applied', project: { ...project, updatedAt: 101 } });
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = vi.fn(() => 'blob:guide-image');
      static revokeObjectURL = vi.fn();
    }
  );
  await render();
  await click('Scenario view');
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (node) => node.textContent === 'Interactive tour'
  );
  await act(async () => option?.click());
  await act(async () =>
    container.querySelectorAll<HTMLButtonElement>('.tour-slide-select')[1]?.click()
  );
  const trigger = container.querySelector<HTMLButtonElement>('[data-tour-edit-image]');
  expect(trigger?.disabled).toBe(false);
  await act(async () => trigger?.click());
  expect(
    container.querySelector('[data-embedded-slide]')?.getAttribute('data-embedded-slide')
  ).toBe('second');
  await click('Apply tour image');
  expect(io.tourEdit).toHaveBeenCalledWith(
    expect.objectContaining({ target: { slideId: 'second' }, baseUpdatedAt: 100 })
  );
  const returned = container.querySelector<HTMLButtonElement>('[data-tour-edit-image]');
  expect(returned?.dataset['tourEditImage']).toBe('second');
  expect(document.activeElement).toBe(returned);
});

it('keeps tour settings editable during autosave while imports stay locked', async () => {
  const project = createGuideProject('Tour', 'guide', 100);
  const slide = createTourImageSlide('image');
  slide.image = {
    assetId: 'image',
    width: 100,
    height: 100,
    alt: '',
    galleryAssetId: null,
    editDocumentId: null,
    source: { kind: 'import', filename: 'image.png' },
  };
  project.tour = { ...createTourDocument(), slides: [slide] };
  io.load.mockResolvedValue(project);
  io.asset.mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = vi.fn(() => 'blob:guide-image');
      static revokeObjectURL = vi.fn();
    }
  );
  let finish!: () => void;
  io.save.mockImplementationOnce(
    (source) =>
      new Promise((resolve) => {
        finish = () => resolve({ ...source, updatedAt: 101 });
      })
  );
  await render();
  const choose = async (label: string, option: string) => {
    await click(label);
    const node = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
      (entry) => entry.textContent === option
    );
    if (!node) throw new Error(`Missing ${option}`);
    await act(async () => node.click());
  };
  await choose('Scenario view', 'Interactive tour');
  await choose('Camera mode', 'Full view');
  await settleAutosave();
  expect(io.save).toHaveBeenCalledOnce();
  const mode = container.querySelector<HTMLButtonElement>('[aria-label="Camera mode"]');
  expect(mode?.disabled).toBe(false);
  const upload = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) => node.textContent === 'Upload image'
  );
  expect(upload?.disabled).toBe(true);
  await choose('Camera mode', 'Manual');
  expect(container.querySelector('input[aria-label="Zoom"]')).not.toBeNull();
  await act(async () => finish());
  await settleAutosave();
  expect(io.save.mock.calls.at(-1)?.[0].tour.slides[0].camera.mode).toBe('manual');
});

it('imports narration from the mounted tour inspector through the source-bound page command', async () => {
  const project = createGuideProject('Tour', 'guide', 100);
  const slide = createTourImageSlide('voice-slide');
  project.tour = { ...createTourDocument(), slides: [slide] };
  io.load.mockResolvedValue(project);
  io.narration.mockResolvedValue({ ...project, updatedAt: 101 });
  await render();
  await click('Scenario view');
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (node) => node.textContent === 'Interactive tour'
  );
  await act(async () => option?.click());
  await act(async () => container.querySelector<HTMLButtonElement>('.tour-slide-select')?.click());
  await click('Inspector');
  const input = container.querySelector<HTMLInputElement>('input[type="file"][accept^="audio/"]');
  expect(input).not.toBeNull();
  const blob = new File(['voice'], 'narration.wav', { type: 'audio/wav' });
  Object.defineProperty(input, 'files', { value: [blob] });
  await act(async () => input?.dispatchEvent(new Event('change', { bubbles: true })));
  expect(io.narration).toHaveBeenCalledOnce();
  expect(io.narration).toHaveBeenCalledWith(
    expect.objectContaining({
      project,
      baseUpdatedAt: 100,
      slideId: 'voice-slide',
      expectedNarration: null,
      blob,
      signal: expect.any(AbortSignal),
    })
  );
});
