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
      <GuideImageDropZone project={project} disabled={disabled} onPlace={place} onImport={files}>
        <article id="step">
          <h2>Title</h2>
          <div data-block-id="image">
            <img alt="" />
          </div>
          <div data-block-id="slot">
            <button>Upload</button>
          </div>
        </article>
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
