// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  useEditorOpenStatus,
  useEditorOpenStatusOwner,
  EditorOpenStatusContext,
} from './open-status';

let owner: ReturnType<typeof useEditorOpenStatusOwner> | null = null;
let consumer: ReturnType<typeof useEditorOpenStatus> = null;
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

function Probe() {
  owner = useEditorOpenStatusOwner('loading');
  return (
    <EditorOpenStatusContext.Provider value={owner}>
      <Consumer />
    </EditorOpenStatusContext.Provider>
  );
}

function Consumer() {
  consumer = useEditorOpenStatus();
  return null;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<Probe />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('moves from loading to idle on success and to error on failure', async () => {
  expect(consumer?.status).toBe('loading');
  await act(async () => owner?.runOpen(async () => undefined));
  expect(consumer?.status).toBe('idle');

  await act(async () => {
    await expect(
      owner?.runOpen(async () => {
        throw new Error('private detail');
      })
    ).rejects.toThrow('private detail');
  });
  expect(consumer?.status).toBe('error');
});

it('ignores a stale failure after a newer open succeeds', async () => {
  let rejectOld: (error: Error) => void = () => undefined;
  const oldOpen = owner?.runOpen(
    () =>
      new Promise<void>((_resolve, reject) => {
        rejectOld = reject;
      })
  );
  await act(async () => owner?.runOpen(async () => undefined));
  await act(async () => {
    rejectOld(new Error('stale'));
    await expect(oldOpen).rejects.toThrow('stale');
  });
  expect(consumer?.status).toBe('idle');
});
