// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { renderCalloutFloatingToolbar } from './views';

it('renders the themed floating toolbar at scale and dispatches formatting commands', async () => {
  const host = document.body.appendChild(document.createElement('div'));
  const portal = document.body.appendChild(document.createElement('div'));
  const root = createRoot(host);
  const applyFormatting = vi.fn();
  expect(
    renderCalloutFloatingToolbar({
      applyFormatting,
      effectiveZIndex: 9,
      floatingToolbarRect: null,
      isEditing: true,
      portalTheme: null,
      portalTarget: portal,
    })
  ).toBeNull();
  await act(async () =>
    root.render(
      renderCalloutFloatingToolbar({
        applyFormatting,
        effectiveZIndex: 9,
        floatingToolbarRect: new DOMRect(100, 80, 200, 40),
        isEditing: true,
        portalTheme: 'dark',
        portalTarget: portal,
        visualScale: 2,
      })
    )
  );
  const wrapper = portal.firstElementChild as HTMLElement;
  expect(wrapper.dataset['theme']).toBe('dark');
  expect(wrapper.style.top).toBe('-12px');
  expect(wrapper.style.left).toBe('76px');
  expect(wrapper.style.zIndex).toBe('9');
  for (const button of portal.querySelectorAll<HTMLButtonElement>('button')) {
    await act(async () => button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
  }
  expect(applyFormatting.mock.calls.map(([command]) => command)).toEqual([
    'bold',
    'italic',
    'underline',
  ]);
  await act(async () => root.unmount());
  document.body.replaceChildren();
});
