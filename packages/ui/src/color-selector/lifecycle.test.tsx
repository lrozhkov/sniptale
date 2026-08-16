// @vitest-environment jsdom

import { act, useRef, type Dispatch, type SetStateAction } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useColorSelectorLifecycle } from './lifecycle';

type HarnessProps = {
  committedColor: string;
  expanded: boolean;
  eyedropperActive?: boolean;
  onPickerOutsideDismiss: () => void;
  pickerOpen: boolean;
  setDraftColor: Dispatch<SetStateAction<string>>;
  setExpanded: Dispatch<SetStateAction<boolean>>;
};

let host: HTMLDivElement;
let root: Root;

function Harness(props: HarnessProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const eyedropperActiveRef = useRef(false);
  eyedropperActiveRef.current = props.eyedropperActive === true;
  useColorSelectorLifecycle({
    ...props,
    eyedropperActiveRef,
    layerRef,
    rootRef,
  });
  return (
    <>
      <div data-testid="root" ref={rootRef} />
      <div data-testid="layer" ref={layerRef} />
    </>
  );
}

function renderHarness(props: HarnessProps) {
  act(() => root.render(<Harness {...props} />));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it('distinguishes owned, outside, expanded, and eyedropper pointer interactions', () => {
  const onPickerOutsideDismiss = vi.fn();
  const setExpanded = vi.fn();
  const base = {
    committedColor: '#111111',
    expanded: false,
    onPickerOutsideDismiss,
    pickerOpen: true,
    setDraftColor: vi.fn(),
    setExpanded,
  };
  renderHarness(base);

  act(() =>
    host
      .querySelector('[data-testid="layer"]')
      ?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  );
  expect(onPickerOutsideDismiss).not.toHaveBeenCalled();

  act(() => document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
  expect(onPickerOutsideDismiss).toHaveBeenCalledOnce();

  onPickerOutsideDismiss.mockClear();
  renderHarness({ ...base, eyedropperActive: true });
  act(() => document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
  expect(onPickerOutsideDismiss).not.toHaveBeenCalled();

  renderHarness({ ...base, expanded: true, pickerOpen: false });
  act(() => document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
  expect(setExpanded).toHaveBeenCalledWith(false);
});

it('routes Escape to the active layer and synchronizes committed color only while closed', () => {
  const onPickerOutsideDismiss = vi.fn();
  const setDraftColor = vi.fn();
  const setExpanded = vi.fn();
  const base = {
    committedColor: '#111111',
    expanded: false,
    onPickerOutsideDismiss,
    pickerOpen: true,
    setDraftColor,
    setExpanded,
  };
  renderHarness(base);

  act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })));
  expect(onPickerOutsideDismiss).not.toHaveBeenCalled();
  act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  expect(onPickerOutsideDismiss).toHaveBeenCalledOnce();

  renderHarness({ ...base, committedColor: '#222222' });
  expect(setDraftColor).not.toHaveBeenCalled();
  renderHarness({ ...base, committedColor: '#222222', pickerOpen: false });
  expect(setDraftColor).toHaveBeenCalledWith('#222222');

  act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  expect(setExpanded).not.toHaveBeenCalled();
  renderHarness({ ...base, expanded: true, pickerOpen: false });
  act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  expect(setExpanded).toHaveBeenCalledWith(false);
});
