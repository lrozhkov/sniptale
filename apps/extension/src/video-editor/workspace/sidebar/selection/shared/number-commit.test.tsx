// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useDedupedNumberChange } from './number-commit';

let root: Root;
let container: HTMLDivElement;
let commit: (value: number) => void;
const onChange = vi.fn();

function Harness({ value }: { value: number }) {
  commit = useDedupedNumberChange(onChange, value);
  return null;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  root = createRoot(container);
  onChange.mockClear();
});
afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

function render(value: number) {
  act(() => root.render(<Harness value={value} />));
}

it('accepts the same numeric edit again after Undo restores an earlier applied value', () => {
  render(1);
  act(() => commit(2));
  render(2);
  render(1);
  act(() => commit(2));
  expect(onChange.mock.calls).toEqual([[2], [2]]);
});

it('deduplicates preview and blur both before and after acknowledgement', () => {
  render(1);
  act(() => {
    commit(2);
    commit(2);
  });
  render(2);
  act(() => commit(2));
  expect(onChange.mock.calls).toEqual([[2]]);
});

it('retains an explicit commit when a separate preview channel already applied its value', () => {
  render(1);
  render(2);
  act(() => {
    commit(2);
    commit(2);
  });
  expect(onChange.mock.calls).toEqual([[2]]);
});
