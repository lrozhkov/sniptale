import { InspectorLayout } from '../../compact-inspector-controls/layout';
import { renderToStaticMarkup } from 'react-dom/server';
// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const { loadMock, saveMock } = vi.hoisted(() => ({
  loadMock: vi.fn(),
  saveMock: vi.fn(),
}));
vi.mock(
  '../../../composition/persistence/highlighter/additional-settings',
  async (importOriginal) => ({
    ...(await importOriginal()),
    loadHighlighterAdditionalSettingsOpen: loadMock,
    saveHighlighterAdditionalSettingsOpen: saveMock,
  })
);

import { AdditionalSettings, ChoiceField, SettingsStack } from './inspector-fields';

let host: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  host = null;
  root = null;
  vi.clearAllMocks();
});

async function renderAdditionalSettings() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(
      <AdditionalSettings section="callout-text">
        <span>Advanced content</span>
      </AdditionalSettings>
    );
  });
  return host.querySelector('details')!;
}

it('restores and remembers the open state across panel remounts', async () => {
  loadMock.mockResolvedValue(true);
  const details = await renderAdditionalSettings();
  await act(async () => Promise.resolve());
  expect(details.open).toBe(true);
  expect(details.className).toContain('border-solid');
  expect(details.querySelector('summary')?.className).toContain('text-[11px]');
  expect(details.querySelector('summary svg')).toBeNull();

  await act(async () => {
    details.open = false;
    details.dispatchEvent(new Event('toggle'));
  });
  expect(saveMock).toHaveBeenCalledWith('callout-text', false);

  await act(async () => root?.unmount());
  root = null;
  host?.remove();
  host = null;

  const reopenedDetails = await renderAdditionalSettings();
  expect(reopenedDetails.open).toBe(false);
  expect(loadMock).toHaveBeenCalledTimes(1);
});

it('renders and selects an additional-settings choice', async () => {
  const onChange = vi.fn();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(
      <ChoiceField
        getLabel={(value) => `choice-${value}`}
        label="Choice"
        onChange={onChange}
        options={['first', 'second']}
        value="first"
      />
    );
  });

  const second = Array.from(host.querySelectorAll('button')).find(
    (button) => button.textContent === 'choice-second'
  );
  await act(async () => second?.click());
  expect(onChange).toHaveBeenCalledWith('second');
});

it('uses canonical parameter stacks only inside a migrated inspector', () => {
  const pending = renderToStaticMarkup(
    <SettingsStack>
      <span>Value</span>
    </SettingsStack>
  );
  const migrated = renderToStaticMarkup(
    <InspectorLayout>
      <SettingsStack>
        <span>Value</span>
      </SettingsStack>
    </InspectorLayout>
  );
  expect(pending).toContain('grid gap-2');
  expect(migrated).toContain('sniptale-parameter-stack');
  expect(migrated).not.toContain('grid gap-2');
});

it('keeps scoped disclosure children mounted while native toggles persist open state', async () => {
  loadMock.mockResolvedValue(false);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () =>
    root?.render(
      <InspectorLayout>
        <AdditionalSettings section="callout-title">
          <input defaultValue="Retained draft" />
        </AdditionalSettings>
      </InspectorLayout>
    )
  );
  const details = host.querySelector('details')!;
  const input = details.querySelector('input')!;
  const summary = details.querySelector('summary')!;
  expect(details.open).toBe(false);
  expect(summary.className).toContain('min-h-8');
  expect(summary.className).toContain('px-2');
  expect(summary.className).toContain('list-none');
  expect(summary.querySelector('svg')).not.toBeNull();
  expect(details.lastElementChild?.className).toContain('sniptale-parameter-stack');
  for (const open of [true, false, true]) {
    await act(async () => {
      details.open = open;
      details.dispatchEvent(new Event('toggle'));
    });
    expect(details.querySelector('input')).toBe(input);
    expect(input.value).toBe('Retained draft');
  }
  expect(saveMock).toHaveBeenCalledWith('callout-title', false);
  expect(saveMock).toHaveBeenCalledWith('callout-title', true);
});
