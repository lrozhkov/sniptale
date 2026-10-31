// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EffectControlChoices, EffectControlFrame, EffectControlTextarea } from './controls';
import { EffectControlTree } from './groups';
import {
  validateEffectV1Document,
  parseEffectV1Source,
  type ControlDefinition,
} from '@sniptale/runtime-contracts/effect-v1';
import { readFileSync } from 'node:fs';
const locale = vi.hoisted(() => ({ value: 'en' }));
vi.mock('../../platform/i18n', () => ({
  translate: (key: string) =>
    key === 'common.units.count' ? (locale.value === 'ru' ? 'шт.' : 'items') : key,
}));
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  locale.value = 'en';
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const choice: ControlDefinition = {
  id: 'mode',
  kind: 'number',
  label: { en: 'Mode' },
  defaultValue: 0,
  options: [
    { value: 0, label: { en: 'Off' } },
    { value: 1, label: { en: 'On' }, icon: 'check' },
  ],
};

it('defaults enums to dropdowns and preserves a typed numeric selection', async () => {
  const change = vi.fn();
  act(() =>
    root.render(
      <EffectControlChoices
        control={choice}
        value={0}
        locale="en"
        disabled={false}
        onChange={change}
      />
    )
  );
  const trigger = host.querySelector<HTMLButtonElement>('[aria-haspopup="listbox"]');
  if (!trigger) throw new Error('Missing dropdown');
  await act(async () => trigger.click());
  const option = document.querySelector<HTMLButtonElement>('[role="option"][title="On"]');
  if (!option) throw new Error('Missing On option');
  await act(async () => option.click());
  expect(change).toHaveBeenLastCalledWith(1);
});

it.each(['segmented', 'toggle'] as const)(
  'honors explicit %s without converting option values',
  (presentation) => {
    const change = vi.fn();
    act(() =>
      root.render(
        <EffectControlChoices
          control={{ ...choice, presentation }}
          value={0}
          locale="en"
          disabled={false}
          onChange={change}
        />
      )
    );
    expect(host.querySelector('[aria-haspopup="listbox"]')).toBeNull();
    const button =
      presentation === 'toggle'
        ? host.querySelector<HTMLButtonElement>('[role="switch"]')
        : host.querySelector<HTMLButtonElement>('button[title="On"]');
    if (!button) throw new Error('Missing option control');
    if (presentation === 'segmented') expect(button.textContent).toContain('On');
    act(() => button.click());
    expect(change).toHaveBeenLastCalledWith(1);
  }
);

it('does not dispatch changes through a disabled toggle', () => {
  const change = vi.fn();
  act(() =>
    root.render(
      <EffectControlChoices
        control={{ ...choice, presentation: 'toggle' }}
        value={0}
        locale="en"
        disabled
        onChange={change}
      />
    )
  );
  const toggle = host.querySelector<HTMLButtonElement>('[role="switch"]');
  if (!toggle) throw new Error('Missing toggle');
  act(() => toggle.click());
  expect(change).not.toHaveBeenCalled();
});

it('retains the declared hierarchy, order and collapsed contents', () => {
  const source = parseEffectV1Source(
    readFileSync(
      'apps/extension/public/video-effects/effects/annotations/sniptale-callout/effect.sniptale-effect.json',
      'utf8'
    )
  );
  if (!source.document) throw new Error('Missing callout fixture');
  source.document.controlGroups?.push({
    id: 'detail',
    parentId: 'tracing',
    label: { en: 'Detail' },
    collapsed: true,
  });
  const amount = source.document.controls.find((control) => control.id === 'traceShare');
  if (!amount) throw new Error('Missing tracing control');
  amount.group = 'detail';
  const parsed = validateEffectV1Document(source.document);
  if (!parsed.ok || !parsed.document) throw new Error('Missing valid nested fixture');
  act(() =>
    root.render(
      <EffectControlTree
        document={parsed.document!}
        parentId="animation"
        controls={parsed.document!.controls}
        renderControl={(control) => <input aria-label={control.id} defaultValue="retained" />}
        renderGroup={(group, children) => (
          <details open={!group.collapsed} data-group={group.id}>
            <summary>{group.label.en}</summary>
            {children}
          </details>
        )}
      />
    )
  );
  const input = host.querySelector<HTMLInputElement>('input[aria-label="traceShare"]');
  expect(input?.closest('[data-group="detail"]')).not.toBeNull();
  const group = host.querySelector<HTMLDetailsElement>('[data-group="detail"]');
  if (!group) throw new Error('Missing details');
  group.open = false;
  expect(host.querySelector('input[aria-label="traceShare"]')).toBe(input);
  expect(input?.value).toBe('retained');
});

it('cancels textarea edits with Escape and commits Ctrl+Enter exactly once', () => {
  const commit = vi.fn();
  act(() =>
    root.render(
      <EffectControlTextarea label="Text" value="before" disabled={false} onCommit={commit} />
    )
  );
  const textarea = host.querySelector('textarea');
  if (!textarea) throw new Error('Missing textarea');
  const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  if (!set) throw new Error('Missing native textarea value setter');
  const edit = (value: string) =>
    act(() => {
      textarea.focus();
      set.call(textarea, value);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
  edit('cancelled');
  act(() => textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(commit).not.toHaveBeenCalled();
  expect(textarea.value).toBe('before');
  edit('accepted');
  act(() =>
    textarea.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true })
    )
  );
  expect(commit).toHaveBeenCalledTimes(1);
  expect(commit).toHaveBeenLastCalledWith('accepted');
});

it('uses ordinary parameter rows without an icon column even when retained metadata has icons', () => {
  act(() =>
    root.render(
      <EffectControlFrame control={{ ...choice, icon: 'settings' }}>
        <input aria-label="Mode" />
      </EffectControlFrame>
    )
  );
  expect(host.querySelector('svg')).toBeNull();
  expect(
    host.querySelector('[data-effect-control-id="mode"] input[aria-label="Mode"]')
  ).not.toBeNull();
});
