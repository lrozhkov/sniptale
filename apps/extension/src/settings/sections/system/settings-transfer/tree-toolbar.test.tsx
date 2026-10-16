// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CommandPressScope } from '@sniptale/ui/control-language/press';
import { SettingsTransferTreeToolbar } from './tree-toolbar';
import { translate } from '../../../../platform/i18n';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function button(label: string) {
  const result = [...host.querySelectorAll('button')].find(
    (node) => node.textContent === label || node.getAttribute('aria-label') === label
  );
  expect(result).toBeDefined();
  return result!;
}

it('edits and clears the controlled query without replacing the search field', async () => {
  const changed = vi.fn();
  function Probe() {
    const [query, setQuery] = useState('initial');
    return (
      <SettingsTransferTreeToolbar
        query={query}
        matchCount={2}
        expandableCount={1}
        scopeCount={2}
        scopeSelected={false}
        expanded={false}
        onQueryChange={(value) => {
          changed(value);
          setQuery(value);
        }}
        onToggleExpansion={vi.fn()}
        onToggleScope={vi.fn()}
      />
    );
  }
  await act(async () =>
    root.render(
      <CommandPressScope value={true}>
        <Probe />
      </CommandPressScope>
    )
  );
  const input = host.querySelector('input')!;
  input.focus();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'query');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(changed).toHaveBeenLastCalledWith('query');
  expect(document.activeElement).toBe(input);
  await act(async () => button(translate('settings.settingsTransfer.clearSearch')).click());
  expect(changed).toHaveBeenLastCalledWith('');
  expect(host.querySelector('input')).toBe(input);
  expect(input.value).toBe('');
  expect(
    host.querySelector('[aria-label="' + translate('settings.settingsTransfer.clearSearch') + '"]')
  ).toBeNull();
});

it.each([
  ['', false, false, 'selectAll', 'expandAll'],
  ['', true, true, 'clearAll', 'collapseAll'],
  ['match', false, false, 'selectFound', 'expandAll'],
  ['match', true, true, 'clearFound', 'collapseAll'],
] as const)(
  'routes selection and expansion actions for query=%s, selected=%s',
  async (query, scopeSelected, expanded, scopeKey, expansionKey) => {
    const onToggleScope = vi.fn();
    const onToggleExpansion = vi.fn();
    await act(async () =>
      root.render(
        <CommandPressScope value={true}>
          <SettingsTransferTreeToolbar
            query={query}
            matchCount={2}
            expandableCount={1}
            scopeCount={2}
            scopeSelected={scopeSelected}
            expanded={expanded}
            onQueryChange={vi.fn()}
            onToggleExpansion={onToggleExpansion}
            onToggleScope={onToggleScope}
          />
        </CommandPressScope>
      )
    );
    await act(async () => {
      button(translate(`settings.settingsTransfer.${scopeKey}`)).click();
      button(translate(`settings.settingsTransfer.${expansionKey}`)).click();
    });
    expect(onToggleScope).toHaveBeenCalledOnce();
    expect(onToggleExpansion).toHaveBeenCalledOnce();
  }
);

it('does not dispatch unavailable collection actions when no nodes apply', async () => {
  const onToggleScope = vi.fn();
  const onToggleExpansion = vi.fn();
  await act(async () =>
    root.render(
      <SettingsTransferTreeToolbar
        query=""
        matchCount={0}
        expandableCount={0}
        scopeCount={0}
        scopeSelected={false}
        expanded={false}
        onQueryChange={vi.fn()}
        onToggleExpansion={onToggleExpansion}
        onToggleScope={onToggleScope}
      />
    )
  );
  const buttons = [...host.querySelectorAll('button')];
  expect(buttons.every((node) => node.disabled)).toBe(true);
  await act(async () => buttons.forEach((node) => node.click()));
  expect(onToggleScope).not.toHaveBeenCalled();
  expect(onToggleExpansion).not.toHaveBeenCalled();
});
