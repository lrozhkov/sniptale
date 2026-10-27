// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { InspectorLayout } from '../../compact-inspector-controls/layout';
import { TextRewriteSettings, type TextRewriteOptions } from './settings';

vi.mock('../../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
let host: HTMLDivElement;
let root: Root;
const change = vi.fn();
const reload = vi.fn();
const initial: TextRewriteOptions = {
  prompt: 'Keep the meaning',
  mode: 'script',
  wholeDocument: true,
  changeIntervals: true,
  resegment: true,
};
function Settings({
  locked = false,
  wholeDocument = true,
  pending = false,
  unavailable = false,
  failed = false,
  unavailableModelName = null,
}: {
  locked?: boolean;
  wholeDocument?: boolean;
  pending?: boolean;
  unavailable?: boolean;
  failed?: boolean;
  unavailableModelName?: string | null;
}) {
  const [options, setOptions] = useState(initial);
  return (
    <InspectorLayout>
      <TextRewriteSettings
        options={options}
        catalog={null}
        modelId=""
        locked={locked}
        wholeDocument={wholeDocument}
        windowFallback={{ start: 1, end: 5 }}
        resultDuration={10}
        catalogError
        selectionPending={pending}
        selectionUnavailable={unavailable}
        unavailableModelName={unavailableModelName}
        selectionFailed={failed}
        onModelChange={vi.fn()}
        onReloadModels={reload}
        onOptionsChange={(patch) => {
          change(patch);
          setOptions((current) => ({ ...current, ...patch }));
        }}
      />
    </InspectorLayout>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
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
const button = (key: string) =>
  host.querySelector<HTMLButtonElement>(`[aria-label="gallery.videoReview.${key}"]`)!;
it('resets resegmentation when timing permission changes and offers explicit catalog recovery', async () => {
  await act(async () => root.render(<Settings />));
  expect(button('textRewriteStructure')).not.toBeNull();
  await act(async () => button('textRewriteTiming').click());
  expect(change).toHaveBeenLastCalledWith({ changeIntervals: false, resegment: false });
  expect(button('textRewriteStructure')).toBeNull();
  await act(async () => button('speechReloadModels').click());
  expect(reload).toHaveBeenCalledOnce();
});
it('clears the prompt as an editable draft and keeps focus on the named field', async () => {
  await act(async () => root.render(<Settings />));
  const prompt = host.querySelector<HTMLTextAreaElement>('textarea')!;
  await act(async () =>
    prompt
      .closest('.sniptale-parameter-row')!
      .querySelector<HTMLButtonElement>('.sniptale-field-clear')!
      .click()
  );
  expect(change).toHaveBeenLastCalledWith({ prompt: '' });
  expect(prompt.value).toBe('');
  expect(document.activeElement).toBe(prompt);
  expect(reload).not.toHaveBeenCalled();
});
it('locks settings and excludes structure permission outside the whole-document scope', async () => {
  await act(async () => root.render(<Settings locked wholeDocument={false} />));
  expect(host.querySelector('fieldset')?.disabled).toBe(true);
  expect(button('textRewriteStructure')).toBeNull();
});
it('restores the accepted window on Escape and commits a later explicit numeric edit once', async () => {
  await act(async () => root.render(<Settings />));
  const value = host.querySelector<HTMLInputElement>('input')!;
  const fill = async (text: string) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(value, text);
      value.dispatchEvent(new Event('input', { bubbles: true }));
    });
  await fill('2');
  await act(async () =>
    value.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  );
  expect(change).not.toHaveBeenCalled();
  await fill('3');
  await act(async () =>
    value.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  );
  expect(change).toHaveBeenCalledOnce();
  expect(change).toHaveBeenLastCalledWith({ window: { start: 3, end: 5 } });
});

it('chooses editing context through measured segments and resets incompatible segmentation', async () => {
  await act(async () => root.render(<Settings />));
  const context = host.querySelector(
    '[role="group"][aria-label="gallery.videoReview.textRewriteMode"]'
  )!;
  expect(context).not.toBeNull();
  expect(context.querySelector('[aria-pressed="true"]')?.textContent).toBe(
    'gallery.videoReview.textRewriteScript'
  );
  await act(async () => button('textRewritePhrases').click());
  expect(change).toHaveBeenLastCalledWith({ mode: 'phrases', resegment: false });
  expect(button('textRewriteStructure')).toBeNull();
  expect(button('textRewritePhrases').getAttribute('aria-pressed')).toBe('true');
});

it('locks pending choices and exposes distinct localized selection recovery messages', async () => {
  await act(async () => root.render(<Settings pending />));
  expect(host.querySelector('fieldset')?.disabled).toBe(true);
  expect(host.querySelector('[role="status"]')?.textContent).toBe('common.states.saving');
  await act(async () => root.render(<Settings unavailable failed />));
  expect(host.querySelector('fieldset')?.disabled).toBe(false);
  expect(host.textContent).toContain('aiModal.modelSelectionUnavailable');
  expect(host.textContent).toContain('aiModal.modelSelectionSaveFailed');
  expect(host.textContent).toContain('aiModal.modelCatalogFailed');
  await act(async () => button('speechReloadModels').click());
  expect(reload).toHaveBeenCalledOnce();
});

it('renders the unavailable model name as literal text and removes it after replacement', async () => {
  const name = '<img src=x onerror=alert(1)> Previous model';
  await act(async () => root.render(<Settings unavailable unavailableModelName={name} />));
  const status = Array.from(host.querySelectorAll('[role="status"]')).find((node) =>
    node.textContent?.includes('aiModal.modelSelectionUnavailable')
  );
  expect(status?.textContent).toContain(name);
  expect(status?.querySelector('img')).toBeNull();
  await act(async () => root.render(<Settings unavailableModelName={null} />));
  expect(host.textContent).not.toContain(name);
});
