// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { TextSelectField } from './select-field';

let host: HTMLDivElement | null = null;
let root: Root | null = null;

function renderField(onChange = vi.fn()) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);

  act(() => {
    root?.render(
      <TextSelectField
        disabled={false}
        label="Font"
        options={[
          { label: 'Inter', value: 'Inter' },
          { label: 'Arial', value: 'Arial' },
        ]}
        value="Inter"
        onChange={onChange}
      />
    );
  });

  return onChange;
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  host?.remove();
  host = null;
  document.body.replaceChildren();
});

it('commits selected option values through CompactSelect', async () => {
  const onChange = renderField();

  await act(async () => {
    document.querySelector<HTMLButtonElement>('button[aria-label="Font"]')?.click();
  });
  await act(async () => {
    document.querySelector<HTMLButtonElement>('button[role="option"][title="Arial"]')?.click();
  });

  expect(onChange).toHaveBeenCalledWith('Arial');
});
