// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GalleryImportDropTarget } from './import-drop-target';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function dispatchDrag(
  target: Element,
  type: 'dragenter' | 'dragleave' | 'dragover' | 'drop',
  files: File[],
  types: string[] = ['Files']
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const dataTransfer = { dropEffect: 'none', files, types };
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
  act(() => target.dispatchEvent(event));
  return { dataTransfer, event };
}

function renderTarget(props: { disabled?: boolean; onFilesDrop?: (files: File[]) => void } = {}) {
  act(() => {
    root?.render(
      <GalleryImportDropTarget
        disabled={props.disabled ?? false}
        {...(props.onFilesDrop ? { onFilesDrop: props.onFilesDrop } : {})}
      >
        <div data-ui="test.library-content" />
      </GalleryImportDropTarget>
    );
  });
  const target = container?.querySelector('[data-ui="gallery.page.root"]');
  if (!target) throw new Error('Expected Gallery drop target');
  return target;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('shows a localized overlay and forwards dropped files without browser navigation', () => {
  const onFilesDrop = vi.fn();
  const target = renderTarget({ onFilesDrop });
  const file = new File(['zip'], 'snapshot.sniptale-page-package.zip');

  const enter = dispatchDrag(target, 'dragenter', [file]);
  expect(enter.event.defaultPrevented).toBe(true);
  expect(container?.textContent).toContain('gallery.importModal.libraryDropTitle');
  expect(container?.textContent).toContain('gallery.importModal.libraryDropDescription');

  const over = dispatchDrag(target, 'dragover', [file]);
  expect(over.event.defaultPrevented).toBe(true);
  expect(over.dataTransfer.dropEffect).toBe('copy');

  const drop = dispatchDrag(target, 'drop', [file]);
  expect(drop.event.defaultPrevented).toBe(true);
  expect(onFilesDrop).toHaveBeenCalledWith([file]);
  expect(container?.querySelector('[data-ui="gallery.import-drop-target"]')).toBeNull();
});

it('ignores non-file drags and blocks imports while another Library action is busy', () => {
  const onFilesDrop = vi.fn();
  const target = renderTarget({ disabled: true, onFilesDrop });
  const file = new File(['zip'], 'snapshot.sniptale-page-package.zip');

  const textDrag = dispatchDrag(target, 'dragenter', [], ['text/plain']);
  expect(textDrag.event.defaultPrevented).toBe(false);
  expect(container?.querySelector('[data-ui="gallery.import-drop-target"]')).toBeNull();

  dispatchDrag(target, 'dragenter', [file]);
  const over = dispatchDrag(target, 'dragover', [file]);
  expect(over.dataTransfer.dropEffect).toBe('none');
  const drop = dispatchDrag(target, 'drop', [file]);
  expect(drop.event.defaultPrevented).toBe(true);
  expect(onFilesDrop).not.toHaveBeenCalled();
});

it('keeps the overlay visible across nested drag targets until the root is left', () => {
  const target = renderTarget();
  const child = container?.querySelector('[data-ui="test.library-content"]');
  if (!child) throw new Error('Expected child content');

  dispatchDrag(target, 'dragenter', []);
  dispatchDrag(child, 'dragenter', []);
  dispatchDrag(child, 'dragleave', []);
  expect(container?.querySelector('[data-ui="gallery.import-drop-target"]')).not.toBeNull();

  dispatchDrag(target, 'dragleave', []);
  expect(container?.querySelector('[data-ui="gallery.import-drop-target"]')).toBeNull();
});
