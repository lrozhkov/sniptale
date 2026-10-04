// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createTranslator } from '../../platform/i18n';
import { GuideResourceDrawer, GuideResourceTrigger } from './resource-drawer';
vi.mock('./resources', () => ({ GuideImageResources: ImportChild }));

let root: Root;
let host: HTMLDivElement;
const cleanup = vi.fn();
function ImportChild({
  onLibraryDragStart,
  toolbarTarget,
  onAddTextStep,
}: {
  onLibraryDragStart?: () => void;
  toolbarTarget?: HTMLElement | null;
  onAddTextStep?: (title: string, description: string) => boolean;
}) {
  useEffect(() => cleanup, []);
  return (
    <>
      {onAddTextStep && <button onClick={() => onAddTextStep('Title', 'Body')}>Frameless</button>}
      {toolbarTarget && createPortal(<button>Import selected</button>, toolbarTarget)}
      <input
        aria-label="Import search"
        draggable
        onDragStart={onLibraryDragStart}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      />
    </>
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
  expect(
    document.querySelector<HTMLElement>('.guide-resource-drawer-surface')?.style.width
  ).toContain('80vw');
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

it('keeps the source mounted during drag and closes cleanly on dragend or Escape', async () => {
  const trigger = await open();
  const input = document.querySelector('[role="dialog"] input')!;
  await act(async () => input.dispatchEvent(new Event('dragstart', { bubbles: true })));
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(document.querySelector('.guide-resource-dragging')).not.toBeNull();
  });
  expect(input.isConnected).toBe(true);
  expect(cleanup).not.toHaveBeenCalled();
  await act(async () => window.dispatchEvent(new Event('dragend')));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  await open();
  await act(async () =>
    document
      .querySelector('[role="dialog"] input')!
      .dispatchEvent(new Event('dragstart', { bubbles: true }))
  );
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  expect(document.querySelector('.guide-resource-dragging')).toBeNull();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it('places import controls after the stable title row and before the scrolling body', async () => {
  await open();
  const dialog = document.querySelector('[role="dialog"]')!;
  const title = dialog.querySelector('.guide-resource-drawer-close')!;
  const toolbar = dialog.querySelector('.guide-resource-header-actions')!;
  const body = dialog.querySelector('.guide-resource-drawer-body')!;
  expect(title.contains(toolbar)).toBe(false);
  expect(title.nextElementSibling).toBe(toolbar);
  expect(toolbar.nextElementSibling).toBe(body);
  expect(toolbar.textContent).toBe('Import selected');
  expect(title.querySelector('button')?.getAttribute('aria-label')).toBe('Close');
});

it('forwards frameless insertion without completing or closing the resource session', async () => {
  const add = vi.fn(() => true);
  await act(async () =>
    root.render(
      <GuideResourceDrawer
        t={createTranslator('en')}
        disabled={false}
        selectedStepId={null}
        onImport={async () => true}
        onAddTextStep={add}
      >
        <GuideResourceTrigger t={createTranslator('en')} />
      </GuideResourceDrawer>
    )
  );
  await open();
  const button = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(
    (item) => item.textContent === 'Frameless'
  )!;
  await act(async () => {
    button.focus();
    button.click();
  });
  expect(add).toHaveBeenCalledWith('Title', 'Body');
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  expect(document.activeElement).toBe(button);
  expect(cleanup).not.toHaveBeenCalled();
});
