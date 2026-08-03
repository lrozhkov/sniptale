// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSystemCalloutPresetCatalog } from '../../../../features/highlighter/callout-presets/catalog';
import { CalloutPresetEditor } from './editor';
import type { CalloutPresetCatalogController } from './types';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
}));

vi.mock('../../../../ui/color-selector', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../ui/color-selector')>()),
  CompactColorSelector: ({
    label,
    onChange,
  }: {
    label: string;
    onChange: (value: string) => void;
  }) => (
    <button data-color-field={label} onClick={() => onChange('transparent')}>
      {label}
    </button>
  ),
}));

const presets = createSystemCalloutPresetCatalog();
let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createController(index: number): CalloutPresetCatalogController {
  const preset = presets[index]!;
  return {
    catalog: {
      catalogCustomized: false,
      defaultPresetId: presets[0]!.id,
      presets,
      systemCatalogRevision: 1,
    },
    draggedId: null,
    dragOverId: null,
    editor: { isOpen: true, preset },
    error: false,
    hoveredId: null,
    isLoading: false,
    isSaving: false,
    actions: {
      add: vi.fn(),
      closeEditor: vi.fn(),
      delete: vi.fn(),
      dragEnd: vi.fn(),
      dragLeave: vi.fn(),
      dragOver: vi.fn(),
      dragStart: vi.fn(),
      drop: vi.fn(),
      edit: vi.fn(),
      hover: vi.fn(),
      reset: vi.fn(),
      save: vi.fn(),
      setDefault: vi.fn(),
      toggle: vi.fn(),
    },
  };
}

async function renderEditor(index: number) {
  await act(async () => root?.render(<CalloutPresetEditor controller={createController(index)} />));
}

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
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('CalloutPresetEditor', () => {
  it('shows line routing and both endpoint markers for a line preset', async () => {
    await renderEditor(4);
    expect(document.body.textContent).toContain('highlighter.calloutPresets.editor.routing');
    expect(document.body.textContent).toContain('highlighter.calloutPresets.editor.frameMarker');
    expect(document.body.textContent).toContain('highlighter.calloutPresets.editor.blockMarker');
    expect(document.body.textContent).toContain('highlighter.calloutPresets.editor.fontFamily');
    expect(document.body.textContent).toContain('highlighter.calloutPresets.editor.titleFontSize');
    expect(document.querySelector<HTMLInputElement>('input[maxlength="64"]')).not.toBeNull();
  });

  it('shows wedge size instead of line-only controls for a bubble preset', async () => {
    await renderEditor(0);
    expect(document.body.textContent).toContain('highlighter.calloutPresets.editor.wedgeSize');
    expect(document.body.textContent).not.toContain(
      'highlighter.calloutPresets.editor.routingStraight'
    );
  });

  it('updates visible style fields through product controls', async () => {
    await renderEditor(4);
    const colorButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-color-field]')];
    for (const button of colorButtons) {
      await act(async () => button.click());
    }
    const numberInputs = [...document.querySelectorAll<HTMLInputElement>('input[type="number"]')];
    for (const input of numberInputs) {
      await act(async () => {
        input.value = input.min || '10';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    const toggles = [...document.querySelectorAll<HTMLButtonElement>('[role="switch"]')];
    for (const toggle of toggles) {
      await act(async () => toggle.click());
    }
    const selectShell = document.querySelector<HTMLElement>('[data-ui="shared.ui.product-select"]');
    await act(async () => selectShell?.querySelector<HTMLButtonElement>('button')?.click());
    const option = document.querySelector<HTMLButtonElement>('[role="option"]');
    await act(async () => option?.click());
    expect(colorButtons.length).toBeGreaterThan(3);
    expect(numberInputs.length).toBeGreaterThan(5);
  });

  it('starts a new user preset from the current default style', async () => {
    const controller = createController(0);
    controller.editor = { isOpen: true };
    await act(async () => root?.render(<CalloutPresetEditor controller={controller} />));
    expect(document.body.textContent).toContain('highlighter.calloutPresets.editor.newTitle');
    expect(document.querySelector<HTMLInputElement>('input[maxlength="64"]')?.value).toBe('');
  });
});
