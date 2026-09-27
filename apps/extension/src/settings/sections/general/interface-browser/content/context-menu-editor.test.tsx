// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRecommendedContextMenuSettings } from '../../../../../contracts/settings/context-menu-layout';
import { buildAppearanceContextMenuOptions } from '../copy';
import { ContextMenuEditor } from './context-menu-editor';

let container: HTMLDivElement;
let root: Root;
const update = vi.fn();
const close = vi.fn();

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  update.mockReset().mockResolvedValue(undefined);
  close.mockReset();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const state = {
    contextMenu: { ...createRecommendedContextMenuSettings(), showWindowResize: true },
    contextMenuOptions: buildAppearanceContextMenuOptions('en'),
    locale: 'en' as const,
    updateContextMenu: update,
  };
  await act(async () => root.render(<ContextMenuEditor state={state} onClose={close} />));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function button(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].find(
    (entry) => entry.getAttribute('aria-label') === label || entry.textContent === label
  );
  if (!found) throw new Error(`Button missing: ${label}`);
  return found;
}
async function click(label: string) {
  await act(async () => button(label).click());
}

it('edits sections and item order in a draft, then commits a complete layout', async () => {
  expect(document.activeElement?.tagName).toBe('H2');
  await click('Add section');
  await click('Section: Video');
  await act(async () => {
    document.querySelector<HTMLButtonElement>('[role="option"]:last-child')?.click();
  });
  expect(document.activeElement).toBe(button('Section: Video'));
  await click('Move up: New section');
  await click('Move down: Screenshots');
  expect(update).not.toHaveBeenCalled();
  await click('Save menu');
  expect(update).toHaveBeenCalledWith(
    expect.objectContaining({
      layout: {
        version: 1,
        sections: [
          { id: 'section-1', title: 'New section', items: ['showVideo'] },
          expect.objectContaining({
            id: 'root',
            items: [
              'showExport',
              'showScreenshots',
              'showImageEditor',
              'showVideoEditor',
              'showGallery',
              'showPageLinkCopy',
              'showWindowResize',
              'showSettings',
            ],
          }),
        ],
      },
    })
  );
  expect(close).toHaveBeenCalledOnce();
});

it('keeps a restored draft cancellable without changing persistence', async () => {
  await click('Restore recommended configuration');
  await click('Cancel');
  expect(update).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
});

it('retains changes after failure, blocks duplicate saves and supports retry', async () => {
  let rejectWrite: ((error: Error) => void) | undefined;
  update.mockImplementationOnce(
    () =>
      new Promise<void>((_resolve, reject) => {
        rejectWrite = reject;
      })
  );
  await click('Restore recommended configuration');
  await click('Save menu');
  await click('Save menu');
  expect(update).toHaveBeenCalledOnce();
  expect(container.textContent).toContain('Saving menu');
  await act(async () => rejectWrite?.(new Error('storage unavailable')));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('try again');
  expect(close).not.toHaveBeenCalled();
  await click('Save menu');
  expect(update).toHaveBeenLastCalledWith(
    expect.objectContaining({ showWindowResize: false, enabled: true })
  );
  expect(close).toHaveBeenCalledOnce();
});

it('removes a populated section without losing its items', async () => {
  await click('Add section');
  await click('Section: Video');
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[role="option"]:last-child')?.click()
  );
  await click('Remove section and move items to main menu');
  await click('Save menu');
  expect(update.mock.calls[0]?.[0].layout.sections).toHaveLength(1);
  expect(update.mock.calls[0]?.[0].layout.sections[0].items.at(-1)).toBe('showVideo');
});
