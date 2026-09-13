// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createGuideProject,
  createTourDocument,
  createTourImageSlide,
} from '../../../features/scenario/project/public';
import { createTranslator } from '../../../platform/i18n';
import { TourImageDropZone, TOUR_RESOURCE_DRAG_TYPE } from './image-drop';
let host: HTMLDivElement;
let root: Root;
const imported = vi.fn();
const changed = vi.fn();
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  imported.mockReset();
  imported.mockResolvedValue(true);
  changed.mockReset();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
function fixture(disabled = false) {
  const project = createGuideProject('Test');
  project.tour = createTourDocument();
  const source = createTourImageSlide('source');
  source.image = {
    assetId: 'accepted',
    width: 100,
    height: 100,
    alt: '',
    galleryAssetId: null,
    editDocumentId: null,
    source: { kind: 'import', filename: 'image.png' },
  };
  project.tour.slides = [source, createTourImageSlide('destination')];
  act(() =>
    root.render(
      <TourImageDropZone
        project={project}
        disabled={disabled}
        onImport={imported}
        onChange={changed}
        t={createTranslator('en')}
      >
        <div data-tour-before="destination" />
        <div data-tour-drop-slide="destination" />
        <div data-canvas="true" />
      </TourImageDropZone>
    )
  );
  return project;
}
async function drop(selector: string, transfer: object) {
  const node = host.querySelector(selector);
  if (!node) throw new Error('Missing drop target');
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: transfer });
  await act(async () => node.dispatchEvent(event));
}
it('routes files to replacement, between slides, or canvas append through the same importer', async () => {
  fixture();
  const file = new File(['image'], 'image.png', { type: 'image/png' });
  const transfer = { types: ['Files'], files: [file] };
  await drop('[data-tour-drop-slide]', transfer);
  expect(imported.mock.calls[0]?.[1]).toEqual({ kind: 'tour-image', slideId: 'destination' });
  await drop('[data-tour-before]', transfer);
  expect(imported.mock.calls[1]?.[1]).toEqual({
    kind: 'tour-slides',
    beforeSlideId: 'destination',
  });
  await drop('[data-canvas]', transfer);
  expect(imported.mock.calls[2]?.[1]).toEqual({ kind: 'tour-slides' });
  expect(changed).not.toHaveBeenCalled();
});
it('resolves local drag identity against the accepted project and rejects a foreign source', async () => {
  const project = fixture();
  const transfer = (projectId: string) => ({
    types: [TOUR_RESOURCE_DRAG_TYPE],
    getData: () => JSON.stringify({ projectId, slideId: 'source' }),
  });
  await drop('[data-tour-drop-slide]', transfer(project.id));
  expect(changed.mock.calls[0]?.[0].tour.slides[1].image.assetId).toBe('accepted');
  await drop('[data-tour-drop-slide]', transfer('foreign'));
  expect(changed).toHaveBeenCalledTimes(1);
  expect(host.querySelector('[role=alert]')).not.toBeNull();
  expect(imported).not.toHaveBeenCalled();
});
it('does not accept a drop while editing is locked', async () => {
  fixture(true);
  await drop('[data-canvas]', {
    types: ['Files'],
    files: [new File(['image'], 'image.png', { type: 'image/png' })],
  });
  expect(imported).not.toHaveBeenCalled();
  expect(changed).not.toHaveBeenCalled();
});

it('shows drag feedback, handles pasted images and leaves text field paste untouched', async () => {
  fixture();
  const canvas = host.querySelector('[data-canvas]')!;
  const transfer = {
    types: ['Files'],
    files: [new File(['image'], 'image.png', { type: 'image/png' })],
    dropEffect: 'none',
  };
  const over = new Event('dragover', { bubbles: true, cancelable: true });
  Object.defineProperty(over, 'dataTransfer', { value: transfer });
  await act(async () => canvas.dispatchEvent(over));
  expect(host.querySelector('[role=status]')).not.toBeNull();
  await act(async () =>
    canvas.dispatchEvent(
      new MouseEvent('dragleave', { bubbles: true, relatedTarget: document.body })
    )
  );
  expect(host.querySelector('[role=status]')).toBeNull();
  const paste = (node: Element) => {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: transfer });
    return node.dispatchEvent(event);
  };
  const input = document.createElement('input');
  canvas.append(input);
  await act(async () => paste(input));
  expect(imported).not.toHaveBeenCalled();
  await act(async () => paste(canvas));
  expect(imported).toHaveBeenCalledTimes(1);
});
it('reports failed imports and aborts a pending operation when the workspace closes', async () => {
  fixture();
  const transfer = {
    types: ['Files'],
    files: [new File(['image'], 'image.png', { type: 'image/png' })],
  };
  imported.mockRejectedValueOnce(new Error('Storage unavailable'));
  await drop('[data-canvas]', transfer);
  expect(host.querySelector('[role=alert]')).not.toBeNull();
  let finish: (accepted: boolean) => void = () => {};
  imported.mockImplementationOnce(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      })
  );
  await drop('[data-canvas]', transfer);
  const signal = imported.mock.calls[1]?.[2] as AbortSignal;
  await drop('[data-canvas]', transfer);
  expect(imported).toHaveBeenCalledTimes(2);
  act(() => root.render(null));
  expect(signal.aborted).toBe(true);
  await act(async () => finish(true));
});
it('adds a local material before a slide and refuses malformed local identity', async () => {
  const project = fixture();
  await drop('[data-tour-before]', {
    types: [TOUR_RESOURCE_DRAG_TYPE],
    getData: () => JSON.stringify({ projectId: project.id, slideId: 'source' }),
  });
  expect(changed.mock.calls[0]?.[0].tour.slides.map((s: { id: string }) => s.id)).toEqual([
    'source',
    expect.any(String),
    'destination',
  ]);
  await drop('[data-canvas]', { types: [TOUR_RESOURCE_DRAG_TYPE], getData: () => '{' });
  expect(changed).toHaveBeenCalledTimes(1);
});
