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
  await act(async () =>
    trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
  );
  expect(onFloatingInteractionChange).toHaveBeenLastCalledWith(true);
  const portalRoot = trigger.getRootNode() as Document | ShadowRoot;
  const menu = portalRoot.querySelector<HTMLElement>(
    '[data-ui="shared.annotation-template-query.filter-menu"]'
  )!;
  expect(menu.className).toContain('overflow-y-auto');
  expect(menu.className).toContain('pointer-events-auto');
  const option = menu.querySelector<HTMLButtonElement>('[role="menuitemcheckbox"]')!;
  expect(portalRoot.activeElement).not.toBe(option);
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
    button.textContent?.includes('Очистить фильтр')
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

it('moves focus into the tag menu only when it is opened from the keyboard', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <AnnotationTemplateQueryControls
        activeFilterTagIds={[]}
        onActiveFilterTagIdsChange={vi.fn()}
        onQueryChange={vi.fn()}
        query=""
        tags={[{ id: 'review', label: 'Review' }]}
      />
    )
  );
  const trigger = host.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!;
  trigger.focus();
  await act(async () => trigger.click());
  const option = document.querySelector<HTMLButtonElement>('[role="menuitemcheckbox"]');

  expect(document.activeElement).toBe(option);
  expect(option?.className).toContain('focus-visible:outline-none');
  expect(option?.className).toContain('focus-visible:ring-[var(--sniptale-color-focus-ring)]');
  expect(trigger.className).toContain('focus-visible:outline-none');
  act(() => root.unmount());
  host.remove();
});

it('applies rapid tag toggles and clear against the latest optimistic selection', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onChange = vi.fn();
  await act(async () =>
    root.render(
      <AnnotationTemplateQueryControls
        activeFilterTagIds={['sniptale', 'paper', 'neon']}
        onActiveFilterTagIdsChange={onChange}
        onQueryChange={vi.fn()}
        query=""
        tags={[
          { id: 'sniptale', label: 'Sniptale' },
          { id: 'paper', label: 'Paper' },
          { id: 'neon', label: 'Neon' },
        ]}
      />
    )
  );
  const trigger = host.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!;
  await act(async () => trigger.click());
  const options = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitemcheckbox"]')];
  act(() => {
    options[1]!.click();
    options[2]!.click();
  });
  expect(onChange).toHaveBeenNthCalledWith(1, ['sniptale', 'neon']);
  expect(onChange).toHaveBeenNthCalledWith(2, ['sniptale']);
  const clear = [...document.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
    button.textContent?.includes('Очистить фильтр')
  )!;
  act(() => clear.click());
  expect(onChange).toHaveBeenNthCalledWith(3, []);
  act(() => root.unmount());
  host.remove();
});
