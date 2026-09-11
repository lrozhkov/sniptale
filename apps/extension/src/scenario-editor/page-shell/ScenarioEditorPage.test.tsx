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
  asset: vi.fn(),
  create: vi.fn(),
  save: vi.fn(),
  select: vi.fn(),
  mount: vi.fn(),
}));
vi.mock('../../composition/persistence/scenario/projects', () => ({
  getScenarioProject: io.load,
}));
vi.mock('../../composition/persistence/scenario/store/project-records/assets', () => ({
  getScenarioAssetBlob: io.asset,
}));
vi.mock('../../composition/persistence/scenario/store/public', () => ({
  createScenarioProjectRecord: io.create,
  saveScenarioProjectRecord: io.save,
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
async function click(label: string) {
  const button = [...container.querySelectorAll('button')].find(
    (node) => node.textContent === label
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
  expect(container.querySelector('h3')?.textContent).toBe('Details');
  expect(container.querySelector('article#first header span')).toBeNull();
  expect(container.querySelector('img')?.alt).toBe('Example image');
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
