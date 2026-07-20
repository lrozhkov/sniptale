// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  stateButton: vi.fn(),
}));

vi.mock('../../../../ui/popup-shell/icon-state-button', () => ({
  PopupIconStateButton: (props: {
    active: boolean;
    description: string;
    disabled?: boolean;
    label: string;
    onClick: () => void;
  }) => {
    mocks.stateButton(props);
    return (
      <button type="button" disabled={props.disabled} onClick={props.onClick}>
        {props.label}
      </button>
    );
  },
}));

import { InlineSelectRow, ModeIconButton } from './primitives';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(node: ReactNode): void {
  container ??= document.createElement('div');
  root ??= createRoot(container);
  act(() => root?.render(node));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container = null;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('renders and routes an enabled mode button without an explicit disabled prop', () => {
  const onClick = vi.fn();

  render(
    <ModeIconButton
      accentClassName="accent"
      active
      hint="Choose a window"
      icon={() => <svg />}
      label="Window"
      onClick={onClick}
    />
  );
  act(() => container?.querySelector('button')?.click());

  expect(mocks.stateButton).toHaveBeenCalledWith(
    expect.objectContaining({
      active: true,
      description: 'Choose a window',
      label: 'Window',
      layout: 'stacked',
    })
  );
  expect(mocks.stateButton.mock.calls[0]?.[0]).not.toHaveProperty('disabled');
  expect(onClick).toHaveBeenCalledOnce();
});

it('forwards an explicit disabled state and renders inline selection content', () => {
  render(
    <>
      <ModeIconButton
        accentClassName="accent"
        active={false}
        disabled
        hint="Unavailable"
        icon={() => <svg />}
        label="Window"
        onClick={vi.fn()}
      />
      <InlineSelectRow ariaLabel="Quality selector" label="Quality">
        <select aria-label="Quality value" />
      </InlineSelectRow>
    </>
  );

  expect(mocks.stateButton).toHaveBeenCalledWith(
    expect.objectContaining({ active: false, disabled: true })
  );
  expect(container?.querySelector('[aria-label="Quality selector"]')?.textContent).toBe('Quality');
  expect(container?.querySelector('[aria-label="Quality value"]')).not.toBeNull();
});
