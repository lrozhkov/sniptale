// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewNumberRow, ReviewPreviewNumberRow } from './number-row';

let root: Root;
let host: HTMLDivElement;
const commit = vi.fn();
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  commit.mockReset();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
function Harness({ echo }: { echo: boolean }) {
  const [authored, setAuthored] = useState(2);
  const [preview, setPreview] = useState<number | null>(null);
  return (
    <>
      <output>{authored}</output>
      <ReviewPreviewNumberRow
        label="Amount"
        min={0}
        max={10}
        step={1}
        value={echo ? (preview ?? authored) : authored}
        previewValue={echo ? undefined : (preview ?? undefined)}
        onPreview={setPreview}
        onChange={(value) => {
          commit(value);
          setAuthored(value);
        }}
      />
    </>
  );
}
function range() {
  return host.querySelector<HTMLInputElement>('input[type="range"]')!;
}
function key(type: string, key: string) {
  act(() => range().dispatchEvent(new KeyboardEvent(type, { key, bubbles: true })));
}
it.each([true, false])('commits a range after parent preview feedback (echo=%s)', async (echo) => {
  await act(async () => root.render(<Harness echo={echo} />));
  key('keydown', 'ArrowRight');
  expect(range().value).toBe('3');
  expect(host.querySelector('output')!.textContent).toBe('2');
  expect(commit).not.toHaveBeenCalled();
  key('keyup', 'ArrowRight');
  expect(commit).toHaveBeenCalledExactlyOnceWith(3);
  expect(host.querySelector('output')!.textContent).toBe('3');
  expect(range().value).toBe('3');
  key('keyup', 'ArrowRight');
  expect(commit).toHaveBeenCalledOnce();
});
it('cancels echoed preview without committing and accepts the next gesture', async () => {
  await act(async () => root.render(<Harness echo />));
  key('keydown', 'ArrowRight');
  key('keydown', 'Escape');
  key('keyup', 'ArrowRight');
  expect(commit).not.toHaveBeenCalled();
  expect(range().value).toBe('2');
  key('keydown', 'ArrowRight');
  key('keyup', 'ArrowRight');
  expect(commit).toHaveBeenCalledExactlyOnceWith(3);
});

it.each(['pointerup', 'pointercancel'])(
  'handles %s after repeated controlled pointer previews',
  async (finish) => {
    await act(async () => root.render(<Harness echo />));
    act(() => range().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
    for (const value of [3, 5, 7]) {
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
          range(),
          String(value)
        );
        range().dispatchEvent(new Event('input', { bubbles: true }));
      });
      expect(range().value).toBe(String(value));
      expect(commit).not.toHaveBeenCalled();
    }
    act(() => range().dispatchEvent(new MouseEvent(finish, { bubbles: true })));
    act(() => range().dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    if (finish === 'pointerup') {
      expect(commit).toHaveBeenCalledExactlyOnceWith(7);
      expect(host.querySelector('output')!.textContent).toBe('7');
    } else {
      expect(commit).not.toHaveBeenCalled();
      expect(range().value).toBe('2');
    }
  }
);

it('deduplicates direct authored updates and accepts the same edit after restoration', async () => {
  function Authored() {
    const [value, setValue] = useState(2);
    return (
      <>
        <button onClick={() => setValue(2)}>Restore</button>
        <ReviewNumberRow
          label="Amount"
          value={value}
          min={0}
          max={10}
          step={1}
          scrubMin={0}
          scrubMax={5}
          scrubStep={0.5}
          onChange={(next) => {
            commit(next);
            setValue(next);
          }}
        />
      </>
    );
  }
  await act(async () => root.render(<Authored />));
  key('keydown', 'ArrowRight');
  key('keyup', 'ArrowRight');
  expect(commit).toHaveBeenCalledExactlyOnceWith(2.5);
  act(() => host.querySelector('button')!.click());
  expect(range().value).toBe('2');
  key('keydown', 'ArrowRight');
  key('keyup', 'ArrowRight');
  expect(commit.mock.calls).toEqual([[2.5], [2.5]]);
});

it.each([ReviewNumberRow, ReviewPreviewNumberRow])(
  'keeps a range gesture disposable and skips a return to its original value (%s)',
  async (Row) => {
    await act(async () =>
      root.render(<Row label="Amount" min={0} max={10} step={1} value={2} onChange={commit} />)
    );
    act(() => range().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
    for (const value of [5, 2]) {
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
          range(),
          String(value)
        );
        range().dispatchEvent(new Event('input', { bubbles: true }));
      });
      expect(range().value).toBe(String(value));
      expect(commit).not.toHaveBeenCalled();
    }
    act(() => range().dispatchEvent(new MouseEvent('pointerup', { bubbles: true })));
    expect(commit).not.toHaveBeenCalled();
  }
);
it('skips a returned gesture even when its parent echoes previews', async () => {
  await act(async () => root.render(<Harness echo />));
  key('keydown', 'ArrowRight');
  key('keydown', 'ArrowLeft');
  key('keyup', 'ArrowLeft');
  expect(commit).not.toHaveBeenCalled();
  expect(range().value).toBe('2');
});

it.each([ReviewNumberRow, ReviewPreviewNumberRow])(
  'discards cancelled text before Enter or blur (%s)',
  async (Row) => {
    await act(async () =>
      root.render(<Row label="Amount" min={0} max={10} step={1} value={2} onChange={commit} />)
    );
    const input = host.querySelector<HTMLInputElement>('input[type="text"]')!;
    const press = (key: string) =>
      act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
    act(() => input.focus());
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '5');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    press('Escape');
    expect(input.value).toBe('2');
    press('Enter');
    act(() => input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    expect(commit).not.toHaveBeenCalled();
  }
);
