// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createGuideImageBlock,
  createGuideProject,
  createGuideStep,
} from '../../features/scenario/project/public';
import { GuideImageDropZone, GUIDE_IMAGE_DRAG_TYPE } from './image-drop';

let host: HTMLDivElement;
let root: Root;
const place = vi.fn();
const files = vi.fn().mockResolvedValue(true);
const project = createGuideProject('Guide', 'project');
const step = createGuideStep('Step', 'step');
step.blocks = [
  createGuideImageBlock({
    id: 'image',
    assetId: 'asset',
    width: 100,
    height: 100,
    source: { kind: 'import', filename: 'image.png' },
  }),
  {
    kind: 'image-slot',
    id: 'slot',
    frame: { width: 100, height: 100 },
    fit: 'contain',
    alt: '',
    caption: '',
  },
];
project.items = [step];
function render(disabled = false) {
  act(() =>
    root.render(
      <GuideImageDropZone
        t={(key) => key}
        project={project}
        disabled={disabled}
        onPlace={place}
        onImport={files}
      >
        <div className="guide-document-scroll">
          <div className="guide-insertion-item" data-insert-before="step" />
          <article id="step">
            <h2>Title</h2>
            <div data-block-id="image">
              <img alt="" />
            </div>
            <div data-block-id="slot">
              <button>Upload</button>
            </div>
          </article>
        </div>
      </GuideImageDropZone>
    )
  );
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  place.mockReset();
  files.mockReset().mockResolvedValue(true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  render();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
function drag(
  selector: string,
  type = 'drop',
  text = JSON.stringify({ projectId: 'project', blockId: 'image' }),
  nativeFiles?: File[]
) {
  const target = host.querySelector(selector);
  if (!target) throw new Error('Missing target');
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: {
      types: nativeFiles ? ['Files'] : [GUIDE_IMAGE_DRAG_TYPE],
      files: nativeFiles ?? [],
      getData: () => text,
      dropEffect: 'none',
    },
  });
  act(() => target.dispatchEvent(event));
  return event;
}
it('routes one image drop to the exact image, empty slot, or step', () => {
  drag('img');
  expect(place).toHaveBeenLastCalledWith({
    kind: 'place-image',
    sourceBlockId: 'image',
    itemId: 'step',
    blockId: 'image',
  });
  drag('button');
  expect(place).toHaveBeenLastCalledWith({
    kind: 'place-image',
    sourceBlockId: 'image',
    itemId: 'step',
    blockId: 'slot',
  });
  drag('h2');
  expect(place).toHaveBeenLastCalledWith({
    kind: 'place-image',
    sourceBlockId: 'image',
    itemId: 'step',
  });
  expect(place).toHaveBeenCalledTimes(3);
});
it('rejects malformed, oversized, cross-project and forged-resource payloads', () => {
  for (const text of [
    '{',
    ' '.repeat(2049),
    JSON.stringify({ projectId: 'other', blockId: 'image' }),
    JSON.stringify({ projectId: 'project', blockId: 'image', assetId: 'forged' }),
  ])
    drag('img', 'drop', text);
  expect(place).not.toHaveBeenCalled();
  expect(files).not.toHaveBeenCalled();
});
it('clears feedback on Escape, leave and disabled state and rejects disabled drops', () => {
  drag('button', 'dragover');
  expect(host.querySelector('[data-image-drop="replace-image"]')).not.toBeNull();
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  expect(host.querySelector('[data-image-drop]')).toBeNull();
  drag('h2', 'dragover');
  drag('h2', 'dragleave');
  expect(host.querySelector('[data-image-drop]')).toBeNull();
  drag('h2', 'dragover');
  render(true);
  expect(host.querySelector('[data-image-drop]')).toBeNull();
  expect(drag('img').defaultPrevented).toBe(true);
  expect(drag('img', 'drop', '', [new File([''], 'image.png')]).defaultPrevented).toBe(true);
  expect(place).not.toHaveBeenCalled();
});
it('imports native files once and aborts preparation on unmount', async () => {
  let finish: ((value: boolean) => void) | undefined;
  files.mockImplementation(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      })
  );
  const file = new File(['image'], 'image.png', { type: 'image/png' });
  drag('button', 'drop', '', [file]);
  drag('button', 'drop', '', [file]);
  expect(files).toHaveBeenCalledTimes(1);
  expect(files.mock.calls[0]?.[1]).toEqual({
    kind: 'replace-image',
    stepId: 'step',
    blockId: 'slot',
  });
  const signal = files.mock.calls[0]?.[2];
  act(() => root.render(null));
  expect(signal.aborted).toBe(true);
  await act(async () => finish?.(true));
});

it('routes a library identity through the existing importer for the exact drop target', () => {
  const target = host.querySelector('button');
  if (!target) throw new Error('Missing slot');
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: {
      types: ['application/x-sniptale-library-image'],
      files: [],
      getData: () => JSON.stringify({ mediaId: 'library-image' }),
    },
  });
  act(() => target.dispatchEvent(event));
  expect(files).toHaveBeenCalledTimes(1);
  expect(files.mock.calls[0]?.[0]).toEqual([{ kind: 'library', mediaId: 'library-image' }]);
  expect(files.mock.calls[0]?.[1]).toEqual({
    kind: 'replace-image',
    stepId: 'step',
    blockId: 'slot',
  });
});

it('rejects malformed or resource-bearing library drag payloads before import', () => {
  for (const text of [
    '{',
    ' '.repeat(2049),
    JSON.stringify({ mediaId: 42 }),
    JSON.stringify({ mediaId: 'image', url: 'https://example.com/image.png' }),
  ]) {
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', {
      value: { types: ['application/x-sniptale-library-image'], files: [], getData: () => text },
    });
    act(() => host.querySelector('h2')!.dispatchEvent(event));
  }
  expect(files).not.toHaveBeenCalled();
  expect(place).not.toHaveBeenCalled();
});

it('inserts image steps at an item boundary and appends on canvas margins', async () => {
  const file = new File(['image'], 'image.png', { type: 'image/png' });
  drag('.guide-insertion-item', 'drop', '', [file]);
  expect(files.mock.calls[0]?.[1]).toEqual({ kind: 'steps', beforeItemId: 'step' });
  await act(async () => {});
  drag('.guide-document-scroll', 'drop', '', [file]);
  expect(files.mock.calls[1]?.[1]).toEqual({ kind: 'steps' });
});

it('routes resources to new steps and leaves inspector drops without mutations', () => {
  drag('.guide-insertion-item');
  expect(place).toHaveBeenLastCalledWith({
    kind: 'place-image',
    sourceBlockId: 'image',
    beforeItemId: 'step',
  });
  drag('.guide-document-scroll');
  expect(place).toHaveBeenLastCalledWith({ kind: 'place-image', sourceBlockId: 'image' });
  drag('.guide-drop-zone');
  expect(place).toHaveBeenCalledTimes(2);
});
it('pastes an image at the focused slot or canvas without intercepting editable text', async () => {
  const file = new File(['image'], 'clipboard.png', { type: 'image/png' });
  function paste(target: Element, nativeFiles: File[]) {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { files: nativeFiles } });
    act(() => target.dispatchEvent(event));
    return event;
  }
  expect(paste(host.querySelector('button')!, [file]).defaultPrevented).toBe(true);
  expect(files.mock.calls[0]?.[1]).toEqual({
    kind: 'replace-image',
    stepId: 'step',
    blockId: 'slot',
  });
  await act(async () => {});
  expect(paste(host.querySelector('.guide-document-scroll')!, [file]).defaultPrevented).toBe(true);
  expect(files.mock.calls[1]?.[1]).toEqual({ kind: 'steps' });
  const textarea = document.createElement('textarea');
  host.querySelector('article')!.append(textarea);
  expect(paste(textarea, [file]).defaultPrevented).toBe(false);
  expect(paste(host.querySelector('button')!, []).defaultPrevented).toBe(false);
  expect(files).toHaveBeenCalledTimes(2);
});
it('recovers after rejected image preparation and clears completed drop feedback', async () => {
  files.mockRejectedValueOnce(new Error('Failed')).mockResolvedValueOnce(true);
  const file = new File(['image'], 'image.png', { type: 'image/png' });
  drag('h2', 'dragover');
  drag('h2', 'drop', '', [file]);
  await act(async () => {});
  expect(host.querySelector('[data-image-drop]')).toBeNull();
  drag('h2', 'drop', '', [file]);
  await act(async () => {});
  expect(files).toHaveBeenCalledTimes(2);
});

it('distinguishes inter-item whitespace from side margins using document geometry', () => {
  const article = host.querySelector('article')!;
  vi.spyOn(article, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 80, 400, 300));
  function over(x: number, y: number) {
    const event = new MouseEvent('dragover', {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
    });
    Object.defineProperty(event, 'dataTransfer', {
      value: { types: ['Files'], dropEffect: 'none' },
    });
    act(() => host.querySelector('.guide-document-scroll')!.dispatchEvent(event));
  }
  over(200, 40);
  expect(host.querySelector('.guide-insertion-item')?.getAttribute('data-image-drop')).toBe(
    'steps'
  );
  over(50, 40);
  expect(host.querySelector('.guide-document-scroll')?.getAttribute('data-image-drop')).toBe(
    'steps'
  );
  expect(host.querySelector('.guide-insertion-item')?.hasAttribute('data-image-drop')).toBe(false);
});

it('distinguishes a valid item named end from the append boundary', () => {
  const namedEnd = { ...project, items: [{ ...step, id: 'end' }] };
  act(() =>
    root.render(
      <GuideImageDropZone
        project={namedEnd}
        disabled={false}
        onPlace={place}
        onImport={files}
        t={(key) => key}
      >
        <div className="guide-document-scroll">
          <div
            className="guide-insertion-item before-end"
            data-insert-before="end"
            data-end="false"
          />
          <article id="end" />
          <div className="guide-insertion-item append" data-insert-before="end" data-end="true" />
        </div>
      </GuideImageDropZone>
    )
  );
  drag('.before-end');
  expect(place).toHaveBeenLastCalledWith({
    kind: 'place-image',
    sourceBlockId: 'image',
    beforeItemId: 'end',
  });
  drag('.append');
  expect(place).toHaveBeenLastCalledWith({ kind: 'place-image', sourceBlockId: 'image' });
});
