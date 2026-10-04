// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { ColorField, NumericRow, CompactInput, CompactRange, CompactSelect } from './primitives';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('passes menuClassName through the editor compact select adapter', () => {
  act(() => {
    root?.render(
      <CompactSelect
        aria-label="Shape preset"
        value="default"
        onChange={() => undefined}
        menuClassName="w-[15rem]"
        options={[
          { value: 'default', label: 'Default' },
          { value: 'soft', label: 'Soft' },
        ]}
      />
    );
  });

  act(() => {
    container?.querySelector('button')?.click();
  });

  expect(document.body.querySelector('[role="listbox"]')?.className).toContain('w-[15rem]');
});

it('omits the compact select menu class when no legacy class is provided', () => {
  act(() => {
    root?.render(
      <CompactSelect
        aria-label="Shape preset"
        value="default"
        onChange={() => undefined}
        options={[{ value: 'default', label: 'Default' }]}
      />
    );
  });

  act(() => {
    container?.querySelector('button')?.click();
  });

  expect(document.body.querySelector('[role="listbox"]')?.className).not.toContain('w-[15rem]');
});

it('forwards shared input and range commit handlers through the editor primitives', () => {
  const onInputCommit = vi.fn();
  const onRangeCommit = vi.fn();

  act(() => {
    root?.render(
      <>
        <CompactInput aria-label="Name" defaultValue="Draft" onValueCommit={onInputCommit} />
        <CompactRange aria-label="Width" defaultValue={7} onValueCommit={onRangeCommit} />
      </>
    );
  });

  act(() => {
    container
      ?.querySelector<HTMLInputElement>('input[aria-label="Name"]')
      ?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    container
      ?.querySelector<HTMLInputElement>('input[aria-label="Width"]')
      ?.dispatchEvent(new Event('pointerup', { bubbles: true }));
  });

  expect(onInputCommit).toHaveBeenCalledWith('Draft');
  expect(onRangeCommit).toHaveBeenCalledWith(7);
});

it('uses shared video-inspector numeric and swatch variants', () => {
  act(() =>
    root?.render(
      <>
        <NumericRow
          label="Radius"
          value={8}
          min={0}
          max={100}
          onPreviewValue={() => undefined}
          onCommitValue={() => undefined}
          scrub={{ min: 0, max: 100 }}
        />
        <ColorField
          label="Color"
          title="Color"
          value="#ff0000"
          palette={[]}
          recentColors={[]}
          onChange={() => undefined}
        />
      </>
    )
  );
  expect(
    container
      ?.querySelector('[data-ui="shared.ui.compact-inspector.numeric-row"]')
      ?.getAttribute('data-appearance')
  ).toBe('plain');
  expect(
    container
      ?.querySelector('[data-ui="shared.ui.compact-inspector.numeric-value-field"]')
      ?.getAttribute('data-focus-appearance')
  ).toBe('accent-box');
  expect(
    container
      ?.querySelector('[data-ui="shared.ui.compact-inspector.numeric-range-scrub"]')
      ?.getAttribute('aria-hidden')
  ).toBe('true');
  expect(
    container
      ?.querySelector('[data-ui="shared.ui.color-selector.trigger"]')
      ?.getAttribute('data-variant')
  ).toBe('swatch');
});
