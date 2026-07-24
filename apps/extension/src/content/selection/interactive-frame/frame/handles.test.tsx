// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createFrameDataFixture } from '../../frame-runtime/test-support';

const portal = vi.hoisted(() => ({ container: null as HTMLDivElement | null }));

vi.mock('../layout/portal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../layout/portal')>()),
  useFixedPortalContainer: () => portal.container,
}));

import { InteractiveFrameResizeHandles } from './handles';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  portal.container?.remove();
  container = null;
  portal.container = null;
  root = null;
});

it('renders all eight neutral resize handles on proximity in standard cursor state', () => {
  container = document.createElement('div');
  portal.container = document.createElement('div');
  document.body.append(container, portal.container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <InteractiveFrameResizeHandles
        borderColor="#ff671d"
        borderWidth={5}
        isResizeHovered
        onResizeStart={vi.fn()}
        state="idle"
        tempFrame={createFrameDataFixture('frame-1')}
      />
    );
  });

  const handles = portal.container.querySelectorAll<HTMLElement>('.sniptale-resize-handle');
  expect(handles).toHaveLength(8);
  expect(Array.from(handles, (handle) => handle.dataset['direction'])).toEqual([
    'nw',
    'n',
    'ne',
    'e',
    'se',
    's',
    'sw',
    'w',
  ]);
  expect(handles[0]?.style.cursor).toBe('nwse-resize');
  expect(handles[1]?.style.cursor).toBe('ns-resize');
  expect(handles[0]?.style.width).toBe('13px');
  expect(handles[0]?.style.height).toBe('13px');
  expect(handles[0]?.style.boxSizing).toBe('border-box');
  expect(handles[0]?.style.backgroundColor).toBe('rgb(255, 255, 255)');
});
