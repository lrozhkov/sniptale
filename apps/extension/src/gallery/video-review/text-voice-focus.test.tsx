// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useReviewTextFormMode } from './text-voice-focus';

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

function Mode({
  triggerKey,
  omitReturn = false,
  scope,
}: {
  triggerKey: string;
  omitReturn?: boolean;
  scope?: string;
}) {
  const [returned, setReturned] = useState(false);
  const mode = useReviewTextFormMode<HTMLElement>(scope);
  if (mode.ids)
    return (
      <button
        autoFocus
        onClick={() => {
          setReturned(true);
          mode.close();
        }}
      >
        Return
      </button>
    );
  return (
    <section ref={mode.root}>
      <input aria-label="Search" />
      {!(returned && omitReturn) && (
        <button
          data-text-voice-trigger={triggerKey}
          onClick={() => {
            mode.open(
              ['text'],
              triggerKey,
              triggerKey.startsWith('rewrite:') ? 'rewrite' : 'voice'
            );
          }}
        >
          Generate
        </button>
      )}
    </section>
  );
}

it.each([
  'selected',
  'fragment:Пример 🎤',
  'batch',
  'rewrite:selected',
  'rewrite:fragment:Пример',
  'rewrite:batch',
  'rewrite:all',
])('restores %s after its trigger is remounted', async (triggerKey) => {
  await act(async () => root.render(<Mode triggerKey={triggerKey} />));
  const original = host.querySelector('button')!;
  original.focus();
  await act(async () => original.click());
  expect(document.activeElement?.textContent).toBe('Return');
  await act(async () => host.querySelector('button')!.click());
  const replacement = host.querySelector('button')!;
  expect(replacement).not.toBe(original);
  expect(document.activeElement).toBe(replacement);
});

it('returns to the local search when the original trigger disappeared', async () => {
  await act(async () => root.render(<Mode triggerKey="fragment:removed" omitReturn />));
  await act(async () => host.querySelector('button')!.click());
  await act(async () => host.querySelector('button')!.click());
  expect(document.activeElement).toBe(host.querySelector('input'));
});

it('closes the temporary form when another selected fragment owns the inspector', async () => {
  await act(async () => root.render(<Mode triggerKey="rewrite:selected" scope="first" />));
  await act(async () => host.querySelector('button')!.click());
  expect(document.activeElement?.textContent).toBe('Return');
  await act(async () => root.render(<Mode triggerKey="rewrite:selected" scope="second" />));
  expect(host.querySelector('button')?.textContent).toBe('Generate');
  expect(host.textContent).not.toContain('Return');
});
