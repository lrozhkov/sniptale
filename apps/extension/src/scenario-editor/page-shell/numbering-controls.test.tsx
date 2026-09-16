// @vitest-environment jsdom
import { act } from 'react';
import { parseGuideProject } from '@sniptale/runtime-contracts/scenario/guide-parser';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { createGuideProject, createGuideStep } from '../../features/scenario/project/public';
import { createTranslator } from '../../platform/i18n';
import { GuideNumberingControls } from './numbering-controls';
let host: HTMLDivElement;
let root: Root;
const change = vi.fn();
const project = createGuideProject('Guide');
project.items = [createGuideStep('First', 'first'), createGuideStep('Second', 'second')];
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
async function render(item = project.items[0]!, disabled = false) {
  await act(async () =>
    root.render(
      <GuideNumberingControls
        project={{ ...project, items: [item, project.items[1]!] }}
        item={item}
        disabled={disabled}
        onChange={change}
        t={createTranslator('en')}
      />
    )
  );
}
function input(label: string) {
  const field =
    host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`) ??
    [...host.querySelectorAll('label')]
      .find((node) => node.textContent === label)
      ?.querySelector('input');
  if (!field) throw new Error(`Missing ${label}`);
  return field;
}
async function fill(label: string, value: string) {
  await act(async () => {
    const field = input(label);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
it('controls visibility/restart with separate undo boundaries and bounds the start value', async () => {
  await render();
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[aria-label="Show step number"]')!.click()
  );
  expect(change.mock.calls.at(-1)).toEqual([{ ...project.items[0], showNumber: false }, null]);
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[aria-label="Restart numbering"]')!.click()
  );
  expect(change.mock.calls.at(-1)).toEqual([
    { ...project.items[0], numbering: { restartAt: 1 } },
    null,
  ]);
  await render(change.mock.calls.at(-1)![0]);
  await fill('Start at', '5');
  await act(async () =>
    input('Start at').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  );
  expect(change.mock.calls.at(-1)?.[0].numbering).toEqual({ restartAt: 5 });
  expect(change.mock.calls.at(-1)?.[1]).toBe('number-start:first');
  const count = change.mock.calls.length;
  for (const invalid of ['', '0', '1.5', '10000']) await fill('Start at', invalid);
  expect(change).toHaveBeenCalledTimes(count);
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[aria-label="Restart numbering"]')!.click()
  );
  expect(change.mock.calls.at(-1)?.[0].numbering?.restartAt).toBeUndefined();
  expectCanonical(change.mock.calls.at(-1)![0]);
});
it('keeps manual labels literal and returns to automatic numbering when cleared', async () => {
  await render({ ...project.items[0]!, numbering: { restartAt: 7 } });
  await fill('Custom number', '<b>A</b>');
  expect(change.mock.calls.at(-1)).toEqual([
    { ...project.items[0], numbering: { restartAt: 7, label: '<b>A</b>' } },
    'number-label:first',
  ]);
  expect(host.querySelector('b')).toBeNull();
  await render(change.mock.calls.at(-1)![0]);
  expect(host.querySelector('output')?.textContent).toBe('7');
  await fill('Custom number', '');
  expect(change.mock.calls.at(-1)?.[0].numbering?.label).toBeUndefined();
  expect(change.mock.calls.at(-1)?.[0].numbering).toEqual({ restartAt: 7 });
  expectCanonical(change.mock.calls.at(-1)![0]);
});
it('offers only restart for a section and removes its override when disabled', async () => {
  const section = {
    kind: 'section',
    id: 'section',
    title: '',
    paragraphs: [],
    numbering: { restartAt: 3 },
  } as const;
  await render({ ...section, paragraphs: [] });
  expect(host.querySelectorAll('input')).toHaveLength(1);
  expect(host.querySelector('output')?.textContent).toBe('3');
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[aria-label="Restart numbering"]')!.click()
  );
  expectCanonical(change.mock.calls.at(-1)![0]);
  await render({ ...section, paragraphs: [] }, true);
  const count = change.mock.calls.length;
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[aria-label="Restart numbering"]')!.click()
  );
  expect(change).toHaveBeenCalledTimes(count);
});

function expectCanonical(item: (typeof project.items)[number]) {
  expect(parseGuideProject({ ...project, items: [item, project.items[1]!] }).status).toBe('ok');
}

it('preserves an empty numeric draft and commits bounded whole numbers', async () => {
  await render({ ...project.items[0]!, numbering: { restartAt: 12 } });
  await fill('Start at', '');
  expect(input('Start at').value).toBe('');
  expect(change).not.toHaveBeenCalled();
  await act(async () =>
    input('Start at').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  );
  expect(input('Start at').value).toBe('12');
  await fill('Start at', '1.7');
  await act(async () =>
    input('Start at').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  );
  expect(change.mock.calls.at(-1)?.[0].numbering.restartAt).toBe(2);
  expectCanonical(change.mock.calls.at(-1)![0]);
  await fill('Start at', '0');
  await act(async () =>
    input('Start at').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  );
  expect(change.mock.calls.at(-1)?.[0].numbering.restartAt).toBe(1);
});
