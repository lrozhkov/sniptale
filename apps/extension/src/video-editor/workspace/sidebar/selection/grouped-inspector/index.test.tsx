// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { InspectorGroupedPanel } from './index';
import type { InspectorGroupDefinition } from './types';
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
const groups: InspectorGroupDefinition<string>[] = [
  { id: 'info', label: 'Summary', content: 'Summary body' },
  {
    id: 'general',
    label: 'Transform',
    content: <input aria-label="Position" defaultValue="10" />,
    defaultActive: true,
  },
  { id: 'audio', label: 'Audio', content: 'Audio body' },
];
function render(items = groups) {
  act(() => root.render(<InspectorGroupedPanel groups={items} />));
}
function select(label: string) {
  act(() =>
    container.querySelector<HTMLButtonElement>(`nav button[aria-label="${label}"]`)!.click()
  );
}
it('uses shared icon categories with one exposed default section', () => {
  render();
  expect(container.querySelectorAll('nav button')).toHaveLength(3);
  expect(container.querySelector('details')).toBeNull();
  expect(container.querySelector('[data-section="general"]')).not.toBeNull();
  expect(container.querySelector('[aria-label="Position"]')).not.toBeNull();
  expect(container.textContent).not.toContain('Summary body');
});
it('preserves a live draft on ordinary rerender and unmounts inactive controls', () => {
  render();
  const input = container.querySelector<HTMLInputElement>('input')!;
  input.value = '27';
  render();
  expect(container.querySelector('input')).toBe(input);
  expect(input.value).toBe('27');
  select('Audio');
  expect(container.textContent).toContain('Audio body');
  expect(container.querySelector('input')).toBeNull();
});
it('supports shared keyboard category navigation and focus', () => {
  render();
  const button = container.querySelector<HTMLButtonElement>('nav button[aria-label="Transform"]')!;
  act(() => {
    button.focus();
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  });
  expect(container.textContent).toContain('Audio body');
  expect(document.activeElement?.getAttribute('aria-label')).toBe('Audio');
});
it('removes hidden controls and chooses an available section', () => {
  render();
  render([{ ...groups[0]!, visible: false }, { ...groups[1]!, visible: false }, groups[2]!]);
  expect(container.querySelectorAll('nav button')).toHaveLength(1);
  expect(container.textContent).toContain('Audio body');
});
it('supports empty and info-only selections', () => {
  render([]);
  expect(container.querySelector('nav')).toBeNull();
  render([groups[0]!]);
  expect(container.textContent).toContain('Summary body');
});
