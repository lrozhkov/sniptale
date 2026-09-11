// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GuidePanelDivider, useGuidePanels } from './panel-layout';

let root: Root;
let host: HTMLDivElement;
function Harness() {
  const panels = useGuidePanels();
  return <GuidePanelDivider side="left" panels={panels} label="Structure" />;
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<Harness />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
function divider() {
  const node = host.querySelector('[role="separator"]');
  if (!(node instanceof HTMLElement)) throw new Error('Missing divider');
  return node;
}
function pointer(target: EventTarget, type: string, clientX: number) {
  const event = new MouseEvent(type, { bubbles: true, clientX, button: 0 });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  act(() => target.dispatchEvent(event));
}
it('resizes with keyboard within limits and restores the default', () => {
  for (let n = 0; n < 20; n++)
    act(() =>
      divider().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    );
  expect(divider().getAttribute('aria-valuenow')).toBe('180');
  act(() => divider().dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })));
  expect(divider().getAttribute('aria-valuenow')).toBe('320');
});
it('cancels a resize with Escape and releases listeners after pointerup', () => {
  pointer(divider(), 'pointerdown', 320);
  pointer(window, 'pointermove', 280);
  expect(divider().getAttribute('aria-valuenow')).toBe('280');
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  expect(divider().getAttribute('aria-valuenow')).toBe('320');
  pointer(window, 'pointermove', 300);
  expect(divider().getAttribute('aria-valuenow')).toBe('320');
  pointer(divider(), 'pointerdown', 320);
  pointer(window, 'pointermove', 260);
  pointer(window, 'pointerup', 260);
  pointer(window, 'pointermove', 310);
  expect(divider().getAttribute('aria-valuenow')).toBe('260');
});
it('releases pointer listeners when the workspace unmounts', () => {
  const remove = vi.spyOn(window, 'removeEventListener');
  pointer(divider(), 'pointerdown', 224);
  act(() => root.render(null));
  expect(remove).toHaveBeenCalledWith('pointermove', expect.any(Function));
  expect(remove).toHaveBeenCalledWith('keydown', expect.any(Function));
  remove.mockRestore();
});
