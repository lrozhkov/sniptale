// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EffectControlChoices, EffectControlFrame, EffectControlTextarea } from './controls';
import { EffectControlTree } from './groups';
import {
  parseEffectControlSet,
  type EffectControlSet,
} from '@sniptale/runtime-contracts/effect-controls';
import { type ControlDefinition } from '@sniptale/runtime-contracts/effect-controls';
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
  const document = parseEffectControlSet({
    controls: [
      { id: 'traceShare', kind: 'number', defaultValue: 50, min: 0, max: 100, group: 'detail' },
    ],
    controlGroups: [
      { id: 'tracing', parentId: 'animation', label: { en: 'Tracing' }, order: 1 },
      { id: 'detail', parentId: 'tracing', label: { en: 'Detail' }, collapsed: true },
    ],
  });
  if (!document) throw new Error('Missing valid nested metadata');
  act(() =>
    root.render(
      <EffectControlTree
        document={document}
        parentId="animation"
        controls={document.controls}
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

it('omits conflicting retained disclosure icons without modifying saved metadata', () => {
  const document: EffectControlSet = {
    controls: [
      { id: 'title', kind: 'text', defaultValue: 'Title', group: 'retained-content' },
      { id: 'fontSize', kind: 'number', defaultValue: 16, group: 'typography' },
    ],
    controlGroups: [
      {
        id: 'retained-content',
        parentId: 'content',
        label: { en: 'Retained content' },
        icon: 'type',
      },
    ],
  };
  const saved = JSON.stringify(document);
  expect(parseEffectControlSet(document)).toBeNull();
  act(() =>
    root.render(
      <EffectControlTree
        document={document}
        parentId="content"
        controls={document.controls}
        renderControl={(control) => <input aria-label={control.id} />}
        renderGroup={(group, children) => (
          <details open>
            <summary>
              {group.icon ? <span data-icon={group.icon} /> : null}
              {group.label.en}
            </summary>
            {children}
          </details>
        )}
      />
    )
  );
  expect(host.querySelector('summary')).not.toBeNull();
  expect(host.querySelector('summary [data-icon]')).toBeNull();
  expect(host.querySelector('input[aria-label="title"]')).not.toBeNull();
  expect(JSON.stringify(document)).toBe(saved);
});

it('renders admitted control metadata without a V1 document or drawing-language fields', async () => {
  const document = {
    controls: [
      { id: 'caption', kind: 'text' as const, defaultValue: 'Текст', group: 'content' },
      {
        id: 'opacity',
        kind: 'number' as const,
        defaultValue: 100,
        min: 0,
        max: 100,
        group: 'appearance',
      },
    ],
    controlGroups: [],
  };
  act(() =>
    root.render(
      <EffectControlTree
        document={document}
        parentId="content"
        controls={document.controls}
        renderControl={(control) => <span>{control.id}</span>}
        renderGroup={(_group, children) => <div>{children}</div>}
      />
    )
  );
  expect(host.textContent).toBe('caption');
  expect(JSON.stringify(document)).not.toContain('schemaVersion');
});
