// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ActiveImportState } from './import-types';
import { GalleryImportProgressCard } from './import-progress-card';

let container: HTMLDivElement;
let root: Root;

function state(overrides: Partial<ActiveImportState> = {}): ActiveImportState {
  return {
    file: new File(['zip'], 'library.zip', { type: 'application/zip' }),
    id: 'import-1',
    progress: {
      bytesRead: 50,
      bytesWritten: 50,
      currentFilename: 'Screenshots/capture.png',
      rootsComplete: 1,
    },
    status: 'running',
    strategy: 'replace',
    totalBytes: 100,
    totalRoots: 2,
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('shows bounded import progress, accepts focus and delegates cancellation', () => {
  const onCancel = vi.fn();
  act(() =>
    root.render(
      <GalleryImportProgressCard state={state()} onCancel={onCancel} onDismiss={vi.fn()} />
    )
  );
  expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('50');
  expect(
    container.querySelector('[data-ui="gallery.import-progress"]')?.getAttribute('aria-live')
  ).toBe('polite');
  expect(container.textContent).toContain('Screenshots/capture.png');
  const button = container.querySelector('button');
  act(() => button?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  expect(onCancel).toHaveBeenCalledOnce();
});

it('shows terminal result and dismisses without a cancel action', () => {
  const onDismiss = vi.fn();
  act(() =>
    root.render(
      <GalleryImportProgressCard
        state={state({
          result: { conflictsResolved: 1, imported: 2, operationId: 'operation-1', skipped: 1 },
          status: 'completed',
        })}
        onCancel={vi.fn()}
        onDismiss={onDismiss}
      />
    )
  );
  expect(container.textContent).toContain('2');
  const button = container.querySelector('button');
  act(() => button?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  expect(onDismiss).toHaveBeenCalledOnce();
});

it('reports failed and root-based cancelled progress as terminal states', () => {
  act(() =>
    root.render(
      <GalleryImportProgressCard
        state={state({
          progress: {
            bytesRead: 0,
            bytesWritten: 0,
            currentFilename: null,
            rootsComplete: 1,
          },
          status: 'failed',
          totalBytes: 0,
          totalRoots: 4,
        })}
        onCancel={vi.fn()}
        onDismiss={vi.fn()}
      />
    )
  );
  expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('25');
  expect((container.querySelector('button') as HTMLButtonElement | null)?.disabled).toBe(false);

  act(() =>
    root.render(
      <GalleryImportProgressCard
        state={state({ status: 'cancelled' })}
        onCancel={vi.fn()}
        onDismiss={vi.fn()}
      />
    )
  );
  expect(container.querySelector('[data-ui="gallery.import-progress"]')).not.toBeNull();
});
