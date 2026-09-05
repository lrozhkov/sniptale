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
function toggle(id: string) {
  act(() => container.querySelector<HTMLElement>(`[data-section="${id}"] summary`)!.click());
}
it('shows all section headings and opens the default controls', () => {
  render();
  expect(container.querySelectorAll('summary')).toHaveLength(3);
  expect(container.querySelector('[data-section="general"]')?.hasAttribute('open')).toBe(true);
  expect(container.querySelector('[data-section="info"]')?.hasAttribute('open')).toBe(false);
  expect(container.querySelector('[aria-label="Position"]')).not.toBeNull();
});
it('opens multiple groups without losing the active parameter input', () => {
  render();
  const input = container.querySelector<HTMLInputElement>('input')!;
  input.value = '27';
  toggle('audio');
  expect(container.textContent).toContain('Audio body');
  expect(container.querySelector('input')).toBe(input);
  expect(input.value).toBe('27');
  toggle('audio');
  expect(container.textContent).not.toContain('Audio body');
  expect(container.querySelector('input')).toBe(input);
});
it('allows all sections to be collapsed without reopening on ordinary rerender', () => {
  render();
  toggle('general');
  render();
  expect(container.querySelectorAll('details[open]')).toHaveLength(0);
});
it('removes hidden content and opens the available group if the open group disappears', () => {
  render();
  render([{ ...groups[0]!, visible: false }, { ...groups[1]!, visible: false }, groups[2]!]);
  expect(container.querySelectorAll('summary')).toHaveLength(1);
  expect(container.textContent).toContain('Audio body');
  expect(container.querySelector('input')).toBeNull();
});
it('supports an empty selection and an info-only selection', () => {
  render([]);
  expect(container.querySelector('details')).toBeNull();
  render([groups[0]!]);
  expect(container.textContent).toContain('Summary body');
});
