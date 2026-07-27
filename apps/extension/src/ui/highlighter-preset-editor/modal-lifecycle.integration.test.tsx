// @vitest-environment jsdom

import { useState } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BorderPresetEditor } from '.';
import { createPreset } from './content.test-support';

let container: HTMLDivElement | null = null;
let host: HTMLDivElement | null = null;
let root: Root | null = null;
let shadowRoot: ShadowRoot | null = null;
const unrelatedFocusables: HTMLElement[] = [];

function EditorHarness() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button data-frame-style-action="edit" onClick={() => setIsOpen(true)} type="button">
        Edit frame style
      </button>
      <BorderPresetEditor
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSave={vi.fn()}
        preset={createPreset()}
      />
    </>
  );
}

async function renderEditorIn(target: HTMLElement | ShadowRoot) {
  container = document.createElement('div');
  target.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<EditorHarness />);
  });

  const trigger = target.querySelector<HTMLButtonElement>('[data-frame-style-action="edit"]');
  if (!trigger) throw new Error('Expected frame style edit trigger');
  trigger.focus();
  await act(async () => {
    trigger.click();
  });
  return trigger;
}

async function openPalette(target: HTMLElement | ShadowRoot) {
  const trigger = target.querySelector<HTMLButtonElement>(
    '[data-ui="shared.ui.color-selector.palette-trigger"]'
  );
  if (!trigger) throw new Error('Expected color selector palette trigger');
  await act(async () => {
    trigger.click();
  });
  const layer = target.querySelector<HTMLElement>(
    '[data-ui="shared.ui.color-selector.expanded-layer"]'
  );
  if (!layer) throw new Error('Expected portaled color selector layer');
  return layer;
}

async function openPicker(target: HTMLElement | ShadowRoot) {
  const trigger = target.querySelector<HTMLButtonElement>(
    '[data-ui="shared.ui.color-selector.picker-trigger"]'
  );
  if (!trigger) throw new Error('Expected color selector picker trigger');
  await act(async () => {
    trigger.click();
  });
  const layer = target.querySelector<HTMLElement>(
    '[data-ui="shared.ui.color-selector.picker-layer"]'
  );
  if (!layer) throw new Error('Expected portaled color picker layer');
  return layer;
}

function addUnrelatedFocusable(target: HTMLElement | ShadowRoot) {
  const sentinel = document.createElement('button');
  sentinel.textContent = 'Unrelated focus target';
  target.append(sentinel);
  unrelatedFocusables.push(sentinel);
  return sentinel;
}

function getActiveElement(target: HTMLElement | ShadowRoot) {
  return target instanceof ShadowRoot ? target.activeElement : document.activeElement;
}

async function expectFocusBridge(args: {
  dialog: HTMLElement;
  layer: HTMLElement;
  sentinel: HTMLElement;
  target: HTMLElement | ShadowRoot;
}) {
  const dialogControls = [
    ...args.dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
    ),
  ];
  const layerControls = [
    ...args.layer.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
    ),
  ];
  const firstDialogControl = dialogControls[0];
  const lastDialogControl = dialogControls.at(-1);
  const firstLayerControl = layerControls[0];
  const lastLayerControl = layerControls.at(-1);
  if (!firstDialogControl || !lastDialogControl || !firstLayerControl || !lastLayerControl) {
    throw new Error('Expected dialog and floating-layer focus controls');
  }

  lastDialogControl.focus();
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
  });
  expect(getActiveElement(args.target)).toBe(firstLayerControl);
  expect(getActiveElement(args.target)).not.toBe(args.sentinel);

  firstLayerControl.focus();
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true }));
  });
  expect(getActiveElement(args.target)).toBe(lastDialogControl);

  lastLayerControl.focus();
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
  });
  expect(getActiveElement(args.target)).toBe(firstDialogControl);
}

async function pressEscape(target: EventTarget) {
  await act(async () => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, composed: true, key: 'Escape' })
    );
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  host?.remove();
  container = null;
  host = null;
  shadowRoot = null;
  unrelatedFocusables.splice(0).forEach((element) => element.remove());
  vi.unstubAllGlobals();
});

describe('highlighter preset editor floating-layer lifecycle', () => {
  it('lets the palette consume Escape before the editor in the document consumer', async () => {
    const trigger = await renderEditorIn(document.body);
    const dialog = document.querySelector<HTMLElement>(
      '.sniptale-highlighter-preset-editor-dialog'
    );
    if (!dialog) throw new Error('Expected editor dialog');
    const sentinel = addUnrelatedFocusable(document.body);
    const layer = await openPalette(document.body);
    expect(layer.getAttribute('data-floating-ui-capture-transient')).toBe('true');
    await expectFocusBridge({ dialog, layer, sentinel, target: document.body });
    const swatch = layer.querySelector<HTMLButtonElement>('button');
    if (!swatch) throw new Error('Expected palette swatch');

    await pressEscape(swatch);

    expect(
      document.querySelector('[data-ui="shared.ui.color-selector.expanded-layer"]')
    ).toBeNull();
    expect(document.querySelector('.sniptale-highlighter-preset-editor-dialog')).not.toBeNull();

    const pickerLayer = await openPicker(document.body);
    expect(pickerLayer.getAttribute('data-floating-ui-capture-transient')).toBe('true');
    await pressEscape(pickerLayer.querySelector('button, input') ?? pickerLayer);
    expect(document.querySelector('[data-ui="shared.ui.color-selector.picker-layer"]')).toBeNull();
    expect(document.querySelector('.sniptale-highlighter-preset-editor-dialog')).not.toBeNull();

    await pressEscape(window);
    expect(document.querySelector('.sniptale-highlighter-preset-editor-dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('uses the ShadowRoot focus chain and includes owned palette controls in the trap', async () => {
    host = document.createElement('div');
    shadowRoot = host.attachShadow({ mode: 'open' });
    document.body.append(host);
    const trigger = await renderEditorIn(shadowRoot);
    const dialog = shadowRoot.querySelector<HTMLElement>(
      '.sniptale-highlighter-preset-editor-dialog'
    );
    if (!dialog) throw new Error('Expected editor dialog');

    expect(document.activeElement).toBe(host);
    expect(dialog.contains(shadowRoot.activeElement)).toBe(true);

    const sentinel = addUnrelatedFocusable(shadowRoot);
    const layer = await openPalette(shadowRoot);
    expect(layer.getAttribute('data-floating-ui-capture-transient')).toBe('true');
    await expectFocusBridge({ dialog, layer, sentinel, target: shadowRoot });
    const swatch = layer.querySelector<HTMLButtonElement>('button');
    if (!swatch) throw new Error('Expected palette swatch');
    await pressEscape(swatch);
    expect(
      shadowRoot.querySelector('[data-ui="shared.ui.color-selector.expanded-layer"]')
    ).toBeNull();
    expect(shadowRoot.querySelector('.sniptale-highlighter-preset-editor-dialog')).not.toBeNull();

    const pickerLayer = await openPicker(shadowRoot);
    expect(pickerLayer.getAttribute('data-floating-ui-capture-transient')).toBe('true');
    await pressEscape(pickerLayer.querySelector('button, input') ?? pickerLayer);
    expect(
      shadowRoot.querySelector('[data-ui="shared.ui.color-selector.picker-layer"]')
    ).toBeNull();
    expect(shadowRoot.querySelector('.sniptale-highlighter-preset-editor-dialog')).not.toBeNull();

    await pressEscape(window);
    expect(shadowRoot.querySelector('.sniptale-highlighter-preset-editor-dialog')).toBeNull();
    expect(shadowRoot.activeElement).toBe(trigger);
  });
});
