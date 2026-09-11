// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createGuideImageBlock,
  createGuideParagraphs,
  createGuideProject,
  createGuideStep,
} from '../../features/scenario/project/factories';

const io = vi.hoisted(() => ({
  load: vi.fn(),
  library: vi.fn(),
  asset: vi.fn(),
  create: vi.fn(),
  duplicate: vi.fn(),
  remove: vi.fn(),
  save: vi.fn(),
  importImages: vi.fn(),
  select: vi.fn(),
  mount: vi.fn(),
}));
vi.mock('../../platform/navigation/extension-pages', () => ({ openGalleryPage: io.library }));
vi.mock('./runtime/resource-session', () => ({ useGuideResourceSession: () => enterSession }));
const enterSession = async () => true;
vi.mock('../../composition/persistence/scenario/projects', () => ({
  getScenarioProject: io.load,
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
  io.library.mockResolvedValue(undefined);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function render() {
  await act(async () => {
    root.render(<ScenarioEditorPage />);
  });
}
async function click(label: string, scope: ParentNode = container) {
  const button = [...scope.querySelectorAll('button')].find(
    (node) => (node.getAttribute('aria-label') ?? node.textContent) === label
  );
  if (!button) throw new Error(`Missing test control ${label}`);
  await act(async () => {
    button.click();
  });
}

it('loads the canonical document and saves added steps against the loaded revision', async () => {
  await render();
  expect(container.querySelectorAll('article')).toHaveLength(1);
  await click('Add step');
  expect(container.querySelectorAll('article')).toHaveLength(2);
  await click('Save');
  expect(io.save).toHaveBeenCalledWith(
    expect.objectContaining({
      version: 4,
      items: expect.arrayContaining([expect.objectContaining({ id: 'first' })]),
    }),
    { baseUpdatedAt: 100 }
  );
  expect(container.textContent).toContain('Saved');
});

it('keeps recoverable edits after save failure and allows retry', async () => {
  io.save.mockRejectedValueOnce(new Error('quota'));
  await render();
  await click('Add step');
  await click('Save');
  expect(container.querySelectorAll('article')).toHaveLength(2);
  expect(container.textContent).toContain('Your edits remain in the editor');
  await click('Save');
  expect(io.save).toHaveBeenCalledTimes(2);
  expect(container.textContent).toContain('Saved');
});

it('does not create or overwrite an unavailable project', async () => {
  io.load.mockRejectedValue(new Error('unsupported'));
  await render();
  expect(container.textContent).toContain('This guide is unavailable');
  expect(io.create).not.toHaveBeenCalled();
  expect(io.save).not.toHaveBeenCalled();
});

it('requires explicit creation for an empty editor route', async () => {
  window.history.replaceState({}, '', '/');
  io.create.mockResolvedValue(createGuideProject('New guide', 'new-guide', 1));
  await render();
  expect(io.create).not.toHaveBeenCalled();
  await click('New scenario');
  expect(io.select).toHaveBeenCalledWith({ projectId: 'new-guide' });
  expect(container.querySelector('input')?.value).toBe('New guide');
});

it('opens a linked step and keeps outline navigation tied to stable item IDs', async () => {
  window.history.replaceState({}, '', '/?projectId=guide&stepId=second');
  const project = createGuideProject('Guide', 'guide', 100);
  project.items = [createGuideStep('First', 'first'), createGuideStep('Second', 'second')];
  io.load.mockResolvedValue(project);
  await render();
  expect(document.activeElement?.id).toBe('second');
  const first = container.querySelector('nav a');
  if (!(first instanceof HTMLAnchorElement)) throw new Error('Expected outline link');
  await act(async () => {
    first.click();
  });
  expect(document.activeElement?.id).toBe('first');
  expect(io.select).toHaveBeenCalledWith({ projectId: 'guide', stepId: 'first' });
  expect(io.save).not.toHaveBeenCalled();
});

it('mounts the guide page through the extension entrypoint', async () => {
  io.mount.mockImplementation(({ element }: { element: ReactNode }) => root.render(element));
  await act(async () => {
    await import('../index');
  });
  expect(io.mount).toHaveBeenCalledWith(
    expect.objectContaining({ namespace: 'ScenarioEditorEntrypoint', strictMode: true })
  );
  expect(container.querySelectorAll('article')).toHaveLength(1);
  expect(io.load).toHaveBeenCalledWith('guide');
});

it('preserves edits and stops repeated saves after a concurrent project change', async () => {
  const error = new Error('Changed elsewhere');
  error.name = 'StaleScenarioAggregateRevisionError';
  io.save.mockRejectedValueOnce(error);
  await render();
  await click('Add step');
  await click('Save');
  expect(container.textContent).toContain('This project changed in another tab');
  expect(container.querySelectorAll('article')).toHaveLength(2);
  await click('Save');
  expect(io.save).toHaveBeenCalledTimes(1);
});

it('renders optional blocks and keeps text edits isolated from images and other steps', async () => {
  const project = createGuideProject('Guide', 'guide', 100);
  const step = createGuideStep('First', 'first');
  step.showNumber = false;
  const image = createGuideImageBlock({
    id: 'image',
    assetId: 'asset',
    width: 800,
    height: 600,
    source: { kind: 'import', filename: 'picture.png' },
  });
  image.caption = 'Image caption';
  image.alt = 'Example image';
  step.blocks = [
    { kind: 'heading', id: 'heading', text: 'Details' },
    { kind: 'text', id: 'text', paragraphs: createGuideParagraphs('Original') },
    { kind: 'note', id: 'note', tone: 'info', paragraphs: createGuideParagraphs('Keep note') },
    image,
  ];
  project.items = [
    {
      kind: 'section',
      id: 'section',
      title: 'Introduction',
      paragraphs: createGuideParagraphs('Section description'),
    },
    step,
    createGuideStep('Other step', 'other'),
  ];
  io.load.mockResolvedValue(project);
  io.asset.mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
  const createUrl = vi.fn(() => 'blob:guide-image');
  const revokeUrl = vi.fn();
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = createUrl;
      static revokeObjectURL = revokeUrl;
    }
  );
  await render();
  expect(container.querySelector('section')?.textContent).toContain('Section description');
  expect(container.querySelector<HTMLInputElement>('[aria-label="Heading"]')?.value).toBe(
    'Details'
  );
  expect(container.querySelector('article#first header span')).toBeNull();
  expect(container.querySelector('article img')?.getAttribute('alt')).toBe('Example image');
  expect(container.querySelector('figcaption')?.textContent).toBe('Image caption');
  const textarea = container.querySelector('textarea');
  if (!textarea) throw new Error('Missing description');
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    setter?.call(textarea, 'Changed\nSecond paragraph');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await click('Save');
  expect(io.save).toHaveBeenCalledWith(
    expect.objectContaining({
      items: [
        project.items[0],
        expect.objectContaining({
          blocks: [
            step.blocks[0],
            expect.objectContaining({
              paragraphs: createGuideParagraphs('Changed\nSecond paragraph'),
            }),
            step.blocks[2],
            image,
          ],
        }),
        project.items[2],
      ],
    }),
    { baseUpdatedAt: 100 }
  );
  expect(io.asset).toHaveBeenCalledTimes(1);
  await act(async () => root.render(null));
  expect(revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:guide-image');
});

it('distinguishes missing image data and ignores an image load completed after unmount', async () => {
  const project = createGuideProject('Guide', 'guide', 100);
  const step = createGuideStep('Images', 'images');
  step.blocks = ['missing', 'pending'].map((id) =>
    createGuideImageBlock({
      id,
      assetId: id,
      width: 800,
      height: 600,
      source: { kind: 'import', filename: id },
    })
  );
  project.items = [step];
  io.load.mockResolvedValue(project);
  let finish: (blob: Blob) => void = () => {
    throw new Error('Load not started');
  };
  io.asset.mockImplementation((id: string) =>
    id === 'missing'
      ? Promise.resolve(undefined)
      : new Promise<Blob>((resolve) => {
          finish = resolve;
        })
  );
  const createUrl = vi.fn();
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = createUrl;
      static revokeObjectURL = vi.fn();
    }
  );
  await render();
  expect(container.querySelectorAll('figure')).toHaveLength(2);
  const statuses = [...container.querySelectorAll('figure [role="status"]')].map(
    (node) => node.textContent
  );
  expect(statuses[0]).not.toBe(statuses[1]);
  expect(container.querySelectorAll('img')).toHaveLength(0);
  await act(async () => root.render(null));
  await act(async () => finish(new Blob(['late'])));
  expect(createUrl).not.toHaveBeenCalled();
});

it('recovers a conflicted edit buffer by copying it and retains it if copying fails', async () => {
  const error = new Error('Changed elsewhere');
  error.name = 'StaleScenarioAggregateRevisionError';
  io.save.mockRejectedValueOnce(error);
  await render();
  await click('Add step');
  await click('Save');
  io.duplicate.mockRejectedValueOnce(new Error('quota'));
  await click('Duplicate project');
  expect(container.querySelectorAll('article')).toHaveLength(2);
  expect(container.textContent).toContain('Could not create a copy');
  expect(container.textContent).toContain('This project changed in another tab');
  await click('Save');
  expect(io.save).toHaveBeenCalledTimes(1);
  await click('Duplicate project');
  expect(io.duplicate).toHaveBeenLastCalledWith(
    expect.objectContaining({ id: 'guide', items: expect.any(Array) }),
    'Local guide — copy'
  );
  expect(io.select).toHaveBeenLastCalledWith({ projectId: 'copy' });
  expect(container.querySelectorAll('article')).toHaveLength(2);
  expect(container.textContent).not.toContain('Could not create a copy');
  await click('Add step');
  await click('Save');
  expect(io.save).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'copy' }), {
    baseUpdatedAt: 102,
  });
});

it('confirms project deletion and clears the project route only after success', async () => {
  await render();
  await click('Delete project');
  expect(io.remove).not.toHaveBeenCalled();
  await click('Cancel');
  expect(container.querySelectorAll('article')).toHaveLength(1);
  await click('Delete project');
  io.remove.mockRejectedValueOnce(new Error('storage'));
  await click('Delete');
  expect(container.textContent).toContain('Could not delete the project');
  expect(container.querySelectorAll('article')).toHaveLength(1);
  await click('Delete project');
  await click('Delete');
  expect(io.remove).toHaveBeenLastCalledWith('guide');
  expect(io.select).toHaveBeenLastCalledWith({ projectId: null });
  expect(container.querySelectorAll('article')).toHaveLength(0);
  expect(container.textContent).toContain('Create a guide and add its first step');
});

it('confirms replacing unsaved edits with the persisted version', async () => {
  await render();
  await click('Add step');
  await click('Reopen saved version');
  expect(io.load).toHaveBeenCalledTimes(1);
  await click('Cancel');
  expect(container.querySelectorAll('article')).toHaveLength(2);
  await click('Reopen saved version');
  const confirm = [...container.querySelectorAll('[role="alertdialog"] button')].find(
    (button) => button.textContent === 'Reopen saved version'
  );
  if (!(confirm instanceof HTMLButtonElement)) throw new Error('Missing reload confirmation');
  await act(async () => confirm.click());
  expect(io.load).toHaveBeenCalledTimes(2);
  expect(container.querySelectorAll('article')).toHaveLength(1);
});

it('prevents duplicate copy submissions and ignores page state updates after unmount', async () => {
  let finish: ((project: ReturnType<typeof createGuideProject>) => void) | undefined;
  io.duplicate.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await render();
  await click('Duplicate project');
  await click('Duplicate project');
  expect(io.duplicate).toHaveBeenCalledTimes(1);
  expect(container.querySelector('input')?.disabled).toBe(true);
  await act(async () => root.render(null));
  await act(async () => finish?.(createGuideProject('Copied', 'copy', 102)));
  expect(io.select).not.toHaveBeenCalled();
});

it('selects an edited step without taking focus or the caret from its field', async () => {
  const project = createGuideProject('Guide', 'guide', 100);
  project.items = [createGuideStep('First', 'first'), createGuideStep('Second', 'second')];
  io.load.mockResolvedValue(project);
  await render();
  const input = container.querySelector('article#second input');
  if (!(input instanceof HTMLInputElement)) throw new Error('Missing step field');
  await act(async () => {
    input.focus();
    input.setSelectionRange(2, 2);
  });
  expect(document.activeElement).toBe(input);
  expect(input.selectionStart).toBe(2);
  expect(container.querySelector('nav a[aria-current]')?.textContent).toContain('Second');
  expect(io.select).toHaveBeenLastCalledWith({ projectId: 'guide', stepId: 'second' });
  expect(io.save).not.toHaveBeenCalled();
});

it('navigates from current resources and collapses panels without changing the document', async () => {
  const project = createGuideProject('Guide', 'guide', 100);
  const step = createGuideStep('Image step', 'image-step');
  step.blocks = [
    createGuideImageBlock({
      id: 'image',
      assetId: 'asset',
      width: 800,
      height: 600,
      source: { kind: 'import', filename: 'image.png' },
    }),
  ];
  project.items = [step];
  io.load.mockResolvedValue(project);
  await render();
  await click('Resources');
  await click('Image step');
  expect(document.activeElement?.id).toBe('image-step');
  await click('Outline');
  expect(container.querySelector('#guide-library-panel')?.hasAttribute('hidden')).toBe(true);
  await click('Outline');
  expect(container.querySelector('#guide-library-panel')?.hasAttribute('hidden')).toBe(false);
  await click('Inspector');
  expect(container.querySelector('#guide-inspector-panel')?.hasAttribute('hidden')).toBe(true);
  expect(container.querySelectorAll('article')).toHaveLength(1);
  expect(io.save).not.toHaveBeenCalled();
});

it('preserves edits when library navigation fails and offers retry', async () => {
  io.library.mockRejectedValueOnce(new Error('tab unavailable'));
  await render();
  await click('Add step');
  await click('Library');
  expect(container.textContent).toContain('Could not open the library');
  expect(container.querySelectorAll('article')).toHaveLength(2);
  await click('Library');
  expect(io.library).toHaveBeenCalledTimes(2);
  expect(container.textContent).not.toContain('Could not open the library');
  expect(io.save).not.toHaveBeenCalled();
});

async function editField(selector: string, value: string) {
  const field = container.querySelector(selector);
  if (!(field instanceof HTMLInputElement) && !(field instanceof HTMLTextAreaElement))
    throw new Error('Missing field');
  await act(async () => {
    field.focus();
    const prototype =
      field instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

it('composes multiple blocks and retains undo after save, then resets it on reload', async () => {
  await render();
  const article = container.querySelector('article#first');
  if (!article) throw new Error('Missing step');
  await click('+ Text', article);
  await click('+ Text', article);
  await click('+ Heading', article);
  await click('+ Note', article);
  expect(article.querySelectorAll('.guide-block')).toHaveLength(4);
  await click('Save');
  await click('Undo');
  expect(article.querySelectorAll('.guide-block')).toHaveLength(3);
  await click('Redo');
  expect(article.querySelectorAll('.guide-block')).toHaveLength(4);
  await click('Reopen saved version');
  const dialog = container.querySelector('[role="alertdialog"]');
  if (!dialog) throw new Error('Missing reload dialog');
  await click('Reopen saved version', dialog);
  expect(container.querySelectorAll('.guide-block')).toHaveLength(0);
  const undo = [...container.querySelectorAll('button')].find(
    (button) => button.getAttribute('aria-label') === 'Undo'
  );
  expect(undo?.disabled).toBe(true);
});

it('groups text edits and routes keyboard undo and redo to the same history', async () => {
  await render();
  await editField('article#first input', 'First change');
  await editField('article#first input', 'Second change');
  const field = container.querySelector('article#first input');
  if (!(field instanceof HTMLInputElement)) throw new Error('Missing field');
  await act(async () =>
    field.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })
    )
  );
  expect(field.value).toBe('First step');
  await act(async () =>
    field.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      })
    )
  );
  expect(field.value).toBe('Second change');
});

it('supports optional numbering and editable sections with structural undo', async () => {
  await render();
  const stepField = container.querySelector('article#first input');
  if (!(stepField instanceof HTMLInputElement)) throw new Error('Missing field');
  await act(async () => stepField.focus());
  const number = container.querySelector('input[type="checkbox"]');
  if (!(number instanceof HTMLInputElement)) throw new Error('Missing number control');
  await act(async () => number.click());
  expect(container.querySelector('article#first header span')).toBeNull();
  await click('Undo');
  expect(container.querySelector('article#first header span')?.textContent).toBe('1');
  await click('Add section');
  await editField('.guide-step-actions input:not([type="checkbox"])', 'A section');
  expect(container.querySelector('.guide-document section h2')?.textContent).toBe('A section');
  await editField('.guide-step-actions textarea', 'Section description');
  expect(container.querySelector('.guide-document section p')?.textContent).toBe(
    'Section description'
  );
  await click('Remove item');
  expect(container.querySelector('.guide-document section')).toBeNull();
  await click('Undo');
  expect(container.querySelector('.guide-document section h2')?.textContent).toBe('A section');
});

it('blocks keyboard history while saving and restores it without changing the saved revision base', async () => {
  let complete: (() => void) | undefined;
  io.save.mockImplementation(
    (project) =>
      new Promise((resolve) => {
        complete = () => resolve({ ...project, updatedAt: 101 });
      })
  );
  await render();
  await click('Add step');
  await click('Save');
  const main = container.querySelector('main');
  if (!main) throw new Error('Missing page');
  await act(async () =>
    main.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })
    )
  );
  expect(container.querySelectorAll('article')).toHaveLength(2);
  await act(async () => complete?.());
  await click('Undo');
  expect(container.querySelectorAll('article')).toHaveLength(1);
  io.save.mockImplementation(async (project) => ({ ...project, updatedAt: 102 }));
  await click('Save');
  expect(io.save).toHaveBeenLastCalledWith(expect.objectContaining({ items: expect.any(Array) }), {
    baseUpdatedAt: 101,
  });
});

it('routes block and item tools through reversible order-preserving mutations', async () => {
  const project = createGuideProject('Guide', 'guide', 100);
  const first = createGuideStep('First', 'first');
  first.blocks = ['One', 'Two', 'Three'].map((text, index) => ({
    kind: 'text',
    id: `text-${index}`,
    paragraphs: createGuideParagraphs(text),
  }));
  project.items = [first, createGuideStep('Next', 'next')];
  io.load.mockResolvedValue(project);
  await render();
  const block = container.querySelector('[data-block-id="text-1"]');
  if (!block) throw new Error('Missing block');
  const tool = async (name: string, scope: ParentNode) => {
    const button = [...scope.querySelectorAll('button')].find(
      (entry) => entry.getAttribute('aria-label') === name
    );
    if (!button) throw new Error('Missing block tool');
    await act(async () => button.click());
  };
  const values = () =>
    [...container.querySelectorAll<HTMLTextAreaElement>('article#first textarea')].map(
      (field) => field.value
    );
  await tool('Move up', block);
  expect(values()).toEqual(['Two', 'One', 'Three']);
  await tool('Move down', block);
  expect(values()).toEqual(['One', 'Two', 'Three']);
  await tool('Duplicate block', block);
  expect(values()).toEqual(['One', 'Two', 'Two', 'Three']);
  await tool('Remove block', block);
  expect(values()).toEqual(['One', 'Two', 'Three']);
  const tail = container.querySelectorAll('article#first .guide-block')[1];
  if (!tail) throw new Error('Missing tail');
  await tool('Split step here', tail);
  expect(container.querySelectorAll('article')).toHaveLength(3);
  expect(values()).toEqual(['One']);
  const title = container.querySelector('article#first input');
  if (!(title instanceof HTMLInputElement)) throw new Error('Missing title');
  await act(async () => title.focus());
  await click('Merge with next step');
  expect(values()).toEqual(['One', 'Two', 'Three']);
  await click('Move down', container.querySelector('.guide-step-actions')!);
  expect([...container.querySelectorAll('article')].map((entry) => entry.id)).toEqual([
    'next',
    'first',
  ]);
  await click('Move up', container.querySelector('.guide-step-actions')!);
  expect([...container.querySelectorAll('article')].map((entry) => entry.id)).toEqual([
    'first',
    'next',
  ]);
  await click('Duplicate item');
  expect(container.querySelectorAll('article')).toHaveLength(3);
  await click('Remove item');
  expect(container.querySelectorAll('article')).toHaveLength(2);
  await click('Undo');
  expect(container.querySelectorAll('article')).toHaveLength(3);
});

it('accepts image import as one undoable publication and saves undo against its new revision', async () => {
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() });
  io.importImages.mockImplementation(async ({ project }) => ({
    ...project,
    updatedAt: 105,
    items: [...project.items, createGuideStep('Imported', 'imported')],
  }));
  await render();
  await editField('article#first input', 'Unsaved title');
  const fileInput = container.querySelector('input[type="file"]');
  Object.defineProperty(fileInput, 'files', {
    value: [new File(['png'], 'one.png', { type: 'image/png' })],
  });
  await act(async () => fileInput?.dispatchEvent(new Event('change', { bubbles: true })));
  await click('Import selected');
  expect(io.importImages.mock.calls[0]?.[0]).toMatchObject({
    baseUpdatedAt: 100,
    project: { items: [{ title: 'Unsaved title' }] },
  });
  expect(container.querySelectorAll('article')).toHaveLength(2);
  await click('Undo');
  expect(container.querySelectorAll('article')).toHaveLength(1);
  expect(container.querySelector('article input')).toHaveProperty('value', 'Unsaved title');
  await click('Save');
  expect(io.save).toHaveBeenLastCalledWith(expect.anything(), { baseUpdatedAt: 105 });
});
