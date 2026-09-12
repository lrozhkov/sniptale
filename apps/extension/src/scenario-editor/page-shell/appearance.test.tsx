// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createGuideProject,
  createGuideStep,
  createGuideParagraphs,
} from '../../features/scenario/project/public';
import { createTranslator } from '../../platform/i18n';
import { GuideAppearance } from './appearance';
let host: HTMLDivElement;
let root: Root;
const change = vi.fn();
const project = createGuideProject('Guide');
project.items = [
  createGuideStep('Step', 'step'),
  { kind: 'section', id: 'section', title: '', paragraphs: [] },
];
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function render(value = project, selectedId = 'step') {
  await act(async () =>
    root.render(
      <GuideAppearance
        project={value}
        selectedId={selectedId}
        disabled={false}
        onChange={change}
        t={createTranslator('en')}
      />
    )
  );
}
async function click(text: string) {
  const button = [...host.querySelectorAll('button')].find(
    (node) => (node.getAttribute('aria-label') ?? node.textContent) === text
  );
  if (!button) throw new Error(`Missing ${text}`);
  await act(async () => button.click());
}
it('changes a single inherited field directly and resets overrides without changing content', async () => {
  await render();
  await click('Serif');
  const next = change.mock.calls.at(-1)![0];
  expect(next.items[0]).toEqual({ ...project.items[0], styleOverrides: { font: 'serif' } });
  await render(next);
  await click('Step layout');
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (node) => node.textContent === 'Comparison'
  )!;
  await act(async () => option.click());
  expect(change.mock.calls.at(-1)![0].items[0]).toMatchObject({
    layout: 'comparison',
    styleOverrides: { font: 'serif' },
  });
  await click('Use guide appearance');
  expect(change.mock.calls.at(-1)![0].items[0]).toEqual(project.items[0]);
  expect(host.querySelector('select')).toBeNull();
  expect(host.textContent).not.toContain('Customize this step');
});
it('keeps section settings contextual and leaves an absent selection empty', async () => {
  await render(project, 'section');
  expect(host.textContent).toContain('Restart numbering');
  expect(host.textContent).not.toContain('Paper theme');
  await render(project, 'missing');
  expect(host.textContent).toBe('');
});
it('applies a layout to manually sized blocks without losing authored content', async () => {
  const step = createGuideStep('Authored step', 'step');
  step.blocks = [
    { id: 'text', kind: 'text', paragraphs: createGuideParagraphs('Keep this text'), width: 37 },
    {
      id: 'slot',
      kind: 'image-slot',
      width: 'full',
      frame: { width: 800, height: 600 },
      fit: 'contain',
      alt: '',
      caption: '',
    },
  ];
  await render({ ...project, items: [step] });
  await click('Step layout');
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (node) => node.textContent === 'Side by side'
  )!;
  await act(async () => option.click());
  const next = change.mock.calls.at(-1)![0].items[0];
  expect(next.blocks).toEqual([
    { id: 'text', kind: 'text', paragraphs: createGuideParagraphs('Keep this text') },
    {
      id: 'slot',
      kind: 'image-slot',
      frame: { width: 800, height: 600 },
      fit: 'contain',
      alt: '',
      caption: '',
    },
  ]);
  expect(next.title).toBe(step.title);
  expect(step.blocks[0]!.width).toBe(37);
});
