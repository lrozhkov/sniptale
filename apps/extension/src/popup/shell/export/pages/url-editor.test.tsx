// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ExportPageSourceSwitch, ExportUrlsEditor } from './url-editor';
import { translate } from '../../../../platform/i18n/popup';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('keeps URL editing focused, neutral, and controlled without changing entered addresses', async () => {
  function Editor() {
    const [text, setText] = useState('https://first.example');
    return (
      <ExportUrlsEditor
        invalid={[]}
        overflow={0}
        selectedCount={2}
        text={text}
        onChange={setText}
      />
    );
  }
  await act(async () => root.render(<Editor />));
  const textarea = container.querySelector('textarea')!;
  expect(document.activeElement).toBe(textarea);
  expect(textarea.className).toContain('focus:border-[var(--sniptale-color-text-secondary)]');
  expect(textarea.className).not.toContain('focus:border-[var(--sniptale-color-accent)]');
  const editedText = 'https://first.example\nhttps://second.example/path?query=value';
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      textarea,
      editedText
    );
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(textarea.value).toBe(editedText);
  expect(container.textContent).toContain(translate('popup.export.urlInputHelp'));
  expect(container.textContent).toContain('2');
});

it.each([
  { invalid: ['bad address'], overflow: 0, key: 'popup.export.urlInputInvalid' as const },
  { invalid: ['bad address'], overflow: 3, key: 'popup.export.urlInputLimit' as const },
])('retains source text and recovery feedback for $key', async ({ invalid, overflow, key }) => {
  await act(async () =>
    root.render(
      <ExportUrlsEditor
        invalid={invalid}
        overflow={overflow}
        selectedCount={1}
        text="draft"
        onChange={vi.fn()}
      />
    )
  );
  expect(container.querySelector('textarea')!.value).toBe('draft');
  const count = overflow || invalid.length;
  expect(container.textContent).toContain(translate(key).replace('{{count}}', String(count)));
});

it('switches page sources through the existing navigation control', async () => {
  const onChange = vi.fn();
  await act(async () => root.render(<ExportPageSourceSwitch mode="tabs" onChange={onChange} />));
  const buttons = [...container.querySelectorAll('button')];
  const urlsButton = buttons.find(
    (button) => button.textContent === translate('popup.export.pageSourceUrls')
  )!;
  await act(async () => urlsButton.click());
  expect(onChange).toHaveBeenCalledWith('urls');
});
