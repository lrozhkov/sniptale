// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { translate } from '../../platform/i18n';
import { GuideDocumentInsert } from './document-insert';

it('offers step and section operations from one visible insertion trigger', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const onOperate = vi.fn();
  await act(async () =>
    root.render(
      <GuideDocumentInsert
        target={{ kind: 'item', beforeItemId: 'next' }}
        disabled={false}
        onOperate={onOperate}
        t={(key) => translate(key, 'en')}
      />
    )
  );
  const trigger = container.querySelector<HTMLButtonElement>('.guide-insertion-chrome button')!;
  expect(trigger.getAttribute('aria-label')).toBe('Insert step or section');
  await act(async () => trigger.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
  const section = [
    ...document.querySelectorAll<HTMLButtonElement>('.guide-action-menu button'),
  ].find((button) => button.textContent?.includes('Add section'))!;
  await act(async () => section.click());
  expect(onOperate).toHaveBeenCalledWith({ kind: 'add-section', beforeItemId: 'next' });
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('places row-start inside the block insert menu and toggles the targeted block', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const onOperate = vi.fn();
  const render = async (rowStart: boolean) =>
    act(async () =>
      root.render(
        <GuideDocumentInsert
          target={{ kind: 'block', itemId: 'step-1', beforeBlockId: 'block-2' }}
          rowStart={rowStart}
          disabled={false}
          onOperate={onOperate}
          t={(key) => translate(key, 'en')}
        />
      )
    );
  await render(false);
  expect(container.querySelectorAll('.guide-insertion-chrome button')).toHaveLength(1);
  const trigger = container.querySelector<HTMLButtonElement>('button')!;
  await act(async () => trigger.click());
  const toggle = document.querySelector<HTMLButtonElement>(
    '.guide-action-menu button[aria-pressed="false"]'
  )!;
  expect(toggle).not.toBeNull();
  await act(async () => toggle.click());
  expect(onOperate).toHaveBeenCalledWith({
    kind: 'set-row-start',
    itemId: 'step-1',
    blockId: 'block-2',
    rowStart: true,
  });
  await render(true);
  await act(async () => trigger.click());
  const enabled = document.querySelector<HTMLButtonElement>(
    '.guide-action-menu button[aria-pressed="true"]'
  )!;
  await act(async () => enabled.click());
  expect(onOperate).toHaveBeenCalledWith({
    kind: 'set-row-start',
    itemId: 'step-1',
    blockId: 'block-2',
    rowStart: false,
  });
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('inserts before the selected block and omits row-start at the end', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const onOperate = vi.fn();
  const render = async (beforeBlockId?: string) =>
    act(async () =>
      root.render(
        <GuideDocumentInsert
          target={{ kind: 'block', itemId: 'step-1', ...(beforeBlockId ? { beforeBlockId } : {}) }}
          {...(beforeBlockId ? { rowStart: false } : {})}
          disabled={false}
          onOperate={onOperate}
          t={(key) => translate(key, 'en')}
        />
      )
    );
  await render('block-2');
  const trigger = container.querySelector<HTMLButtonElement>('button')!;
  await act(async () => trigger.click());
  const image = document.querySelector<HTMLButtonElement>(
    '.guide-action-menu button[title="Image"]'
  )!;
  await act(async () => image.click());
  expect(onOperate).toHaveBeenCalledWith({
    kind: 'add-block',
    itemId: 'step-1',
    blockKind: 'image-slot',
    beforeBlockId: 'block-2',
  });
  await render();
  await act(async () => trigger.click());
  expect(document.querySelector('.guide-action-menu button[aria-pressed]')).toBeNull();
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
