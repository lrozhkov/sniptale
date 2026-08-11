// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSystemCalloutPresetCatalog } from '../../../../../features/highlighter/callout-presets/catalog';
import { CalloutPresetEditor } from './editor';
import type { CalloutPresetCatalogController } from './types';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
}));

vi.mock(
  '../../../../../composition/surface-style-preset-resources/use-surface-style-preset-catalog',
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import('../../../../../composition/surface-style-preset-resources/use-surface-style-preset-catalog')
      >();
    const { getSystemSurfaceStylePresets } =
      await import('../../../../../features/highlighter/surface-style/system-presets');
    return {
      ...original,
      useSurfaceStylePresetCatalog: () => ({
        actions: {
          onCreate: vi.fn(),
          onDelete: vi.fn(),
          onDuplicate: vi.fn(),
          onRename: vi.fn(),
          onReorder: vi.fn(),
          onReset: vi.fn(),
          onToggleFavorite: vi.fn(),
          onUpdate: vi.fn(),
        },
        catalog: { catalogRevision: 1, unsafeForWrite: false },
        presets: getSystemSurfaceStylePresets().map((preset, order) => ({
          ...preset,
          favorite: false,
          order,
        })),
      }),
    };
  }
);

vi.mock('../../../../../ui/color-selector', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../ui/color-selector')>()),
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
    editor: { isOpen: true, preset },
    error: false,
    isLoading: false,
    isSaving: false,
    actions: {
      add: vi.fn(),
      closeEditor: vi.fn(),
      delete: vi.fn(),
      edit: vi.fn(),
      moveBefore: vi.fn(),
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

async function openSection(label: string) {
  await act(async () =>
    document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)?.click()
  );
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
    const navigation = [...document.querySelectorAll<HTMLButtonElement>('nav button')];
    expect(navigation.at(-1)?.getAttribute('aria-label')).toBe('content.callout.positionSection');
    expect(document.querySelectorAll('[data-callout-anchor]')).toHaveLength(0);
    await openSection('content.callout.positionSection');
    expect(document.body.textContent).toContain(
      'highlighter.calloutPresets.editor.defaultPosition'
    );
    expect(document.querySelectorAll('[data-callout-anchor]')).toHaveLength(8);
    await openSection('content.callout.manualConnector');
    expect(document.body.textContent).toContain('content.callout.routingLabel');
    expect(document.body.textContent).toContain('content.callout.frameMarker');
    expect(document.body.textContent).toContain('content.callout.blockMarker');
    await openSection('content.callout.manualText');
    expect(document.body.textContent).toContain('content.callout.fontFamilyLabel');
    await openSection('content.callout.manualTitle');
    expect(document.body.textContent).toContain('content.callout.titleFontSizeLabel');
    expect(document.querySelector<HTMLInputElement>('input[maxlength="64"]')).not.toBeNull();
  });

  it('shows wedge size instead of line-only controls for a bubble preset', async () => {
    await renderEditor(0);
    await openSection('content.callout.manualConnector');
    expect(document.body.textContent).toContain('content.callout.tailSizeLabelPrefix');
    expect(document.body.textContent).not.toContain('content.callout.routing.straight');
  });

  it('updates visible style fields through product controls', async () => {
    await renderEditor(4);
    await openSection('content.callout.manualBackground');
    const surfaceSelector = document.querySelector<HTMLButtonElement>(
      '[data-ui="shared.ui.surface-style-selector"] > button'
    );
    expect(surfaceSelector).not.toBeNull();
    await act(async () => surfaceSelector?.click());
    expect(document.body.textContent).toContain('content.callout.surfaceStyle.advancedCss');
    expect(document.querySelectorAll('[data-color-field]').length).toBeGreaterThan(0);
    expect(
      document.querySelectorAll('[data-ui="shared.ui.compact-inspector.numeric-row"]').length
    ).toBeGreaterThan(0);
    await openSection('content.callout.manualConnector');
    expect(document.querySelector('[data-ui="shared.ui.compact-select"]')).not.toBeNull();
    await openSection('content.callout.manualBorder');
    expect(
      document.querySelectorAll('[data-ui="shared.ui.compact-inspector.numeric-row"]').length
    ).toBeGreaterThan(1);
  });

  it('starts a new user preset from the current default style', async () => {
    const controller = createController(0);
    controller.editor = { isOpen: true };
    await act(async () => root?.render(<CalloutPresetEditor controller={controller} />));
    expect(document.body.textContent).toContain('highlighter.calloutPresets.editor.newTitle');
    expect(document.querySelector<HTMLInputElement>('input[maxlength="64"]')?.value).toBe('');
  });

  it('offers a factory reset for a customized system preset', async () => {
    const controller = createController(0);
    const source = controller.editor.preset!;
    controller.editor = { isOpen: true, preset: { ...source, customized: true } };
    await act(async () => root?.render(<CalloutPresetEditor controller={controller} />));

    const reset = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'highlighter.calloutPresets.reset'
    );
    expect(reset).toBeDefined();
    await act(async () => reset?.click());

    expect(controller.actions.reset).toHaveBeenCalledWith(source.id);
    expect(controller.actions.closeEditor).toHaveBeenCalledOnce();
  });
});
