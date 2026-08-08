// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
vi.mock('./status-panel', () => ({ NativeStatusPanel: () => <div>native-status</div> }));
import { NativeConnectionView } from '.';
it('delegates connection presentation to the status owner', () => {
  const node = document.createElement('div');
  const root = createRoot(node);
  act(() => root.render(<NativeConnectionView status={null} onAction={vi.fn()} />));
  expect(node.textContent).toBe('native-status');
  act(() => root.unmount());
});
