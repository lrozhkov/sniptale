// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScenarioDeckExportOptions } from '../../project/export/deck/types';
import { ScenarioDeckExportOptionToggles } from './option-toggles';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('ScenarioDeckExportOptionToggles', () => {
  it('renders compact boolean rows and toggles each export option', () => {
    const onChange = vi.fn();
    renderToggles(onChange);

    clickToggle('Include speaker notes');
    clickToggle('Show missing asset placeholders');
    clickToggle('Include slide source JSON');

    expect(container?.textContent).toContain('Adds per-slide notes blocks');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ includeNotes: false }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ includeMissingPlaceholders: false })
    );
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ includeSourceJson: true }));
  });
});

function renderToggles(onChange: (options: ScenarioDeckExportOptions) => void) {
  act(() => {
    root?.render(
      <ScenarioDeckExportOptionToggles
        options={{
          assetMode: 'embed',
          format: 'html',
          includeMissingPlaceholders: true,
          includeNotes: true,
          includeSourceJson: false,
        }}
        onChange={onChange}
      />
    );
  });
}

function clickToggle(label: string) {
  const button = container?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  expect(button).not.toBeNull();
  act(() => button?.click());
}
