// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { AnnotationTemplateQueryControls } from './filter';

async function verifyTagMenuInteractions(host: Element | DocumentFragment) {
  const root = createRoot(host);
  const onChange = vi.fn();
  const onFloatingInteractionChange = vi.fn();
  const render = async (activeFilterTagIds: string[]) =>
    act(async () =>
      root.render(
        <AnnotationTemplateQueryControls
          activeFilterTagIds={activeFilterTagIds}
          onActiveFilterTagIdsChange={onChange}
          onFloatingInteractionChange={onFloatingInteractionChange}
          onQueryChange={vi.fn()}
          query=""
          tags={[{ id: 'review', label: 'Review' }]}
        />
      )
    );
  await render([]);
  const queryRoot = host instanceof Element ? host : host;
  const trigger = queryRoot.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!;
  await act(async () => trigger.click());
  expect(onFloatingInteractionChange).toHaveBeenLastCalledWith(true);
  const portalRoot = trigger.getRootNode() as Document | ShadowRoot;
  const menu = portalRoot.querySelector<HTMLElement>(
    '[data-ui="shared.annotation-template-query.filter-menu"]'
  )!;
  expect(menu.className).toContain('overflow-y-auto');
  expect(menu.className).toContain('pointer-events-auto');
  const option = menu.querySelector<HTMLButtonElement>('[role="menuitemcheckbox"]')!;
  expect(document.activeElement === option || host instanceof ShadowRoot).toBe(true);
  act(() => {
    option.click();
  });
  expect(onChange).toHaveBeenCalledWith(['review']);
  await render(['review']);
  expect(trigger.getAttribute('data-active')).toBe('true');
  expect(trigger.getAttribute('aria-pressed')).toBe('true');
  expect(option.getAttribute('data-active')).toBe('true');
  act(() => {
    option.click();
  });
  expect(onChange).toHaveBeenLastCalledWith([]);
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  const clear = [...menu.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
    button.textContent?.includes('Сбросить теги')
  )!;
  act(() => {
    clear.click();
  });
  expect(onChange).toHaveBeenLastCalledWith([]);
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  await act(async () =>
    menu.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
  );
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  expect(onFloatingInteractionChange).toHaveBeenLastCalledWith(false);
  act(() => root.unmount());
}

it('keeps real pointer interactions owned while toggling and clearing tag filters', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  await verifyTagMenuInteractions(host);
  host.remove();
});

it('keeps tag and clear actions clickable inside a closed content ShadowRoot', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const shadowRoot = host.attachShadow({ mode: 'closed' });
  await verifyTagMenuInteractions(shadowRoot);
  host.remove();
});
