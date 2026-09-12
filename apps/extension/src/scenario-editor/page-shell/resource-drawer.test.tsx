// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createTranslator } from '../../platform/i18n';
import { GuideResourceDrawer, GuideResourceTrigger } from './resource-drawer';
vi.mock('./resources', () => ({ GuideImageResources: () => <ImportChild /> }));

let root: Root;
let host: HTMLDivElement;
const cleanup = vi.fn();
function ImportChild() {
  useEffect(() => cleanup, []);
  return (
    <input
      aria-label="Import search"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    />
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([
    new DOMRect(0, 0, 100, 30),
  ] as unknown as DOMRectList);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root.render(
      <GuideResourceDrawer
        t={createTranslator('en')}
        disabled={false}
        selectedStepId={null}
        onImport={async () => true}
      >
        <GuideResourceTrigger t={createTranslator('en')} />
      </GuideResourceDrawer>
    )
  );
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function open() {
  const trigger = host.querySelector('button')!;
  await act(async () => {
    trigger.focus();
    trigger.click();
  });
  return trigger;
}
async function key(target: Element, key: string, shiftKey = false) {
  await act(async () =>
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true })
    )
  );
}
it('traps keyboard focus and unmounts import preparation when the drawer closes', async () => {
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  const trigger = await open();
  const dialog = document.querySelector('[role="dialog"]')!;
  const close = dialog.querySelector('button')!;
  const input = dialog.querySelector('input')!;
  expect(document.activeElement).toBe(close);
  await key(close, 'Tab', true);
  expect(document.activeElement).toBe(input);
  await key(input, 'Tab');
  expect(document.activeElement).toBe(close);
  await key(close, 'Escape');
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(cleanup).toHaveBeenCalledTimes(1);
});
it('leaves Escape to a child layer and dismisses through the shared backdrop', async () => {
  const trigger = await open();
  const input = document.querySelector('[role="dialog"] input')!;
  await key(input, 'Escape');
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  const backdrop = document.querySelector<HTMLElement>('.sniptale-modal-backdrop')!;
  await act(async () => backdrop.click());
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(cleanup).toHaveBeenCalledTimes(1);
});
