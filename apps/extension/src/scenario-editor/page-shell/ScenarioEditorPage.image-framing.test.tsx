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
import { GUIDE_AUTOSAVE_IDLE_MS } from './runtime/autosave';
import { ScenarioEditorPage } from './ScenarioEditorPage';

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers();
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
  vi.useRealTimers();
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
  await act(async () => vi.advanceTimersByTimeAsync(GUIDE_AUTOSAVE_IDLE_MS));
}
it('selects an image by pointer without entering framing or changing the document', async () => {
  const project = createGuideProject('Images', 'guide', 100);
  const step = createGuideStep('Image step', 'images');
  step.blocks = [
    createGuideImageBlock({
      id: 'one',
      assetId: 'asset',
      width: 800,
      height: 600,
      source: { kind: 'import', filename: 'one.png' },
    }),
  ];
  project.items = [step];
  io.load.mockResolvedValue(project);
  await render();
  const block = container.querySelector<HTMLElement>('[data-block-id="one"]')!;
  await act(async () =>
    block
      .querySelector('figure')!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
  );
  expect(container.querySelector('#guide-inspector-panel .guide-image-controls')).not.toBeNull();
  expect(block.getAttribute('data-selected')).toBe('true');
  expect(block.querySelector('figure')?.getAttribute('data-editing')).toBe('false');
  expect(io.save).not.toHaveBeenCalled();
});

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
  expect(inspector.querySelector('.guide-image-controls')).not.toBeNull();
  expect(second.querySelector('figure')?.getAttribute('data-editing')).toBe('false');
  await act(async () =>
    inspector
      .querySelector('.guide-image-description input')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  );
  expect(inspector.querySelector('.guide-image-controls')).toBeNull();
  expect(document.activeElement).toBe(container.querySelector('article#images'));
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
  expect(document.activeElement).toBe(container.querySelector('article#blocks'));
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

for (const selector of ['.guide-image-slot', '.guide-image-slot button']) {
  it(`selects the empty image slot from ${selector} focus without changing the previous block`, async () => {
    const project = createGuideProject('Slots', 'guide', 100);
    const step = createGuideStep('Step', 'slots');
    step.blocks = [
      { kind: 'text', id: 'text', paragraphs: [] },
      {
        kind: 'image-slot',
        id: 'slot',
        frame: { width: 960, height: 540 },
        fit: 'contain',
        alt: '',
        caption: '',
      },
    ];
    project.items = [step];
    io.load.mockResolvedValue(project);
    await render();
    await act(async () =>
      container.querySelector<HTMLTextAreaElement>('[data-block-id="text"] textarea')!.focus()
    );
    await act(async () => container.querySelector<HTMLElement>(selector)!.focus());
    const inspector = container.querySelector('#guide-inspector-panel')!;
    await click('Half width', inspector);
    expect(container.querySelector('[data-block-id="slot"]')?.getAttribute('data-width')).toBe(
      '50'
    );
    expect(container.querySelector('[data-block-id="text"]')?.getAttribute('data-width')).toBe(
      '100'
    );
    expect(inspector.querySelector('.guide-image-controls')).toBeNull();
    await click('Undo');
    expect(container.querySelector('[data-block-id="slot"]')?.getAttribute('data-width')).toBe(
      '100'
    );
  });
}

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
  await click('Interactive tour');
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
  await click('Interactive tour');
  await act(async () => container.querySelector<HTMLButtonElement>('.tour-slide-select')?.click());
  if (!container.querySelector('[aria-label="Camera mode"]')) {
    const showAll = container.querySelector<HTMLButtonElement>('button[title="Show all settings"]');
    if (showAll) await act(async () => showAll.click());
  }
  await choose('Camera mode', 'Full view');
  await settleAutosave();
  expect(io.save).toHaveBeenCalledOnce();
  const mode = container.querySelector<HTMLButtonElement>('[aria-label="Camera mode"]');
  expect(mode?.disabled).toBe(false);
  await click('Resources');
  const upload = container.querySelector<HTMLButtonElement>(
    '.guide-image-resources button[title="Image"]'
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
  await click('Interactive tour');
  await act(async () => container.querySelector<HTMLButtonElement>('.tour-slide-select')?.click());
  await click('Inspector');
  const showAll = container.querySelector<HTMLButtonElement>('button[title="Show all settings"]');
  if (showAll) await act(async () => showAll.click());
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

it('switches representations directly from the header and keeps only the active label', async () => {
  await render();
  const choices = () =>
    Array.from(container.querySelectorAll<HTMLButtonElement>('.tour-representation-switch button'));
  expect(choices()).toHaveLength(2);
  expect(choices().map((button) => button.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
  expect(choices()[0]?.querySelector('span')).not.toBeNull();
  expect(choices()[1]?.querySelector('span')).toBeNull();
  expect(container.querySelector('.guide-page-header')?.firstElementChild?.className).toBe(
    'tour-representation-switch'
  );
  await act(async () => choices()[0]?.click());
  expect(choices()[0]?.getAttribute('aria-pressed')).toBe('true');
  await act(async () => choices()[1]?.click());
  expect(choices().map((button) => button.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
  expect(choices()[0]?.querySelector('span')).toBeNull();
  expect(choices()[1]?.querySelector('span')).not.toBeNull();
  await act(async () => choices()[0]?.click());
  expect(choices()[0]?.getAttribute('aria-pressed')).toBe('true');
  expect(container.querySelector('.guide-document-scroll')).not.toBeNull();
});

it('places tour controls after the title and representation switch only in tour mode', async () => {
  const project = createGuideProject('Tour header', 'guide', 100);
  const slide = createTourImageSlide('first');
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
  await render();
  expect(container.querySelector('.tour-header-controls')).toBeNull();
  await click('Interactive tour');
  const header = container.querySelector('.guide-page-header')!;
  const title = header.querySelector('.guide-project-name')!;
  const controls = header.querySelector('.tour-header-controls')!;
  const representation = header.querySelector('.tour-representation-switch')!;
  expect(controls).not.toBeNull();
  expect(title.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(
    representation.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy();
  const actions = [...controls.querySelectorAll('button')].map((button) => button.title);
  expect(actions).toContain('Preview');
  expect(actions).toContain('Edit image');
  expect(actions).not.toContain('Editing');
  await click('Guide');
  expect(container.querySelector('.tour-header-controls')).toBeNull();
});

it('opens standalone tour export and returns to the selected slide', async () => {
  const project = createGuideProject('Export tour', 'guide', 100);
  const slide = createTourImageSlide('export-slide');
  slide.title = 'Export slide';
  project.tour = { ...createTourDocument(), slides: [slide] };
  io.load.mockResolvedValue(project);
  await render();
  await click('Interactive tour');
  await click('Export');
  expect(container.querySelector('.tour-export')).not.toBeNull();
  expect(container.textContent).toContain('Prepare and preview');
  await act(async () =>
    container.querySelector<HTMLButtonElement>('.tour-export .guide-export-heading button')?.click()
  );
  expect(container.querySelector('.tour-export')).toBeNull();
  expect(container.querySelector('.tour-slide-list')?.textContent).toContain('Export slide');
});

it('uses the project name in the tab and distinguishes reader preview', async () => {
  await render();
  expect(document.title).toBe('Local guide');
  await editField('.guide-project-name input', 'Renamed guide');
  expect(document.title).toBe('Renamed guide');
  await click('Export');
  expect(document.title).toBe('Renamed guide · Просмотр');
  await click('Back to editing');
  expect(document.title).toBe('Renamed guide');
});

it.each(['text', 'heading', 'note', 'image-slot'] as const)(
  'selects %s without editing and returns through step to document appearance',
  async (kind) => {
    const project = createGuideProject('Selection', 'guide', 100);
    const step = createGuideStep('Step', 'step');
    step.blocks =
      kind === 'text'
        ? [{ id: 'block', kind, paragraphs: [] }]
        : kind === 'heading'
          ? [{ id: 'block', kind, text: 'Heading' }]
          : kind === 'note'
            ? [{ id: 'block', kind, tone: 'info', paragraphs: [] }]
            : [
                {
                  id: 'block',
                  kind,
                  alt: '',
                  caption: '',
                  frame: { width: 960, height: 540 },
                  fit: 'contain',
                },
              ];
    project.items = [step];
    io.load.mockResolvedValue(project);
    await render();
    const block = container.querySelector<HTMLElement>('[data-block-id="block"]')!;
    await act(async () =>
      block.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    );
    expect(block.getAttribute('data-selected')).toBe('true');
    expect(document.activeElement).toBe(block);
    expect(container.querySelector('article')?.getAttribute('data-selected')).toBe('false');
    await act(async () =>
      block.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    );
    expect(container.querySelector('article')?.getAttribute('data-selected')).toBe('true');
    await act(async () =>
      container
        .querySelector('article')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    );
    expect(container.querySelector('article')?.getAttribute('data-selected')).toBe('false');
    expect(container.querySelector('#guide-inspector-panel')?.textContent).toContain(
      'Entire guide'
    );
    expect(io.save).not.toHaveBeenCalled();
  }
);

it('keeps the moved block selected and focused across steps and undo', async () => {
  const project = createGuideProject('Transfer', 'guide', 100);
  const source = createGuideStep('Source', 'source');
  source.blocks = [{ id: 'moving', kind: 'text', paragraphs: [] }];
  project.items = [source, createGuideStep('Destination', 'destination')];
  io.load.mockResolvedValue(project);
  await render();
  const pane = container.querySelector('.guide-document-scroll')!;
  vi.spyOn(pane, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 500, 600));
  for (const [index, article] of [...container.querySelectorAll('article')].entries()) {
    const rect = new DOMRect(0, index * 200, 100, 100);
    vi.spyOn(article, 'getBoundingClientRect').mockReturnValue(rect);
    vi.spyOn(article.querySelector('.guide-step-blocks')!, 'getBoundingClientRect').mockReturnValue(
      rect
    );
  }
  const block = container.querySelector<HTMLElement>('[data-block-id="moving"]')!;
  vi.spyOn(block, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 100));
  const grip = block.querySelector('button.guide-block-grip')!;
  Object.assign(grip, {
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => true,
    releasePointerCapture: vi.fn(),
  });
  for (const [type, x, y] of [
    ['pointerdown', 10, 10],
    ['pointermove', 50, 250],
    ['pointerup', 50, 250],
  ] as const) {
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: x,
      clientY: y,
    });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    await act(async () => (type === 'pointerdown' ? grip : window).dispatchEvent(event));
  }
  const moved = container.querySelector<HTMLElement>('[data-block-id="moving"]')!;
  expect(moved.closest('article')?.id).toBe('destination');
  expect(moved.getAttribute('data-selected')).toBe('true');
  expect(document.activeElement).toBe(moved);
  await click('Undo');
  const restored = container.querySelector<HTMLElement>('[data-block-id="moving"]')!;
  expect(restored.closest('article')?.id).toBe('source');
  expect(restored.getAttribute('data-selected')).toBe('true');
  expect(document.activeElement).toBe(restored);
});
