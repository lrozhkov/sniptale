// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { translate } from '../../../../platform/i18n';
import { ViewportPresetEditorContent, ViewportPresetEditorFooter } from './views';

const { actionButtonPropsSpy } = vi.hoisted(() => ({
  actionButtonPropsSpy: vi.fn(),
}));

vi.mock('@sniptale/ui/product-modal/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-modal/actions')>()),
  ProductActionButton: (
    props: React.ButtonHTMLAttributes<HTMLButtonElement> & { compact?: boolean }
  ) => {
    actionButtonPropsSpy(props);

    return (
      <button type={props.type} disabled={props.disabled} onClick={props.onClick}>
        {props.children}
      </button>
    );
  },
}));

vi.mock('@sniptale/ui/product-form-controls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-form-controls')>()),
  ProductField: (props: { children: React.ReactNode; label: string }) => (
    <label>
      <span>{props.label}</span>
      {props.children}
    </label>
  ),
  ProductInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('@sniptale/ui/product-modal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-modal')>()),
  ProductModalBody: (
    props: React.FormHTMLAttributes<HTMLFormElement> & { children: React.ReactNode }
  ) => <form onSubmit={props.onSubmit}>{props.children}</form>,
  ProductModalFooter: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
}));

vi.mock('./surface/classes', () => ({
  settingsModalFieldSurfaceClassName: 'field-surface',
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderElement(element: React.ReactElement) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(element);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  actionButtonPropsSpy.mockReset();
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

function verifyViewportPresetEditorContent() {
  const setLabel = vi.fn();
  const setWidth = vi.fn();
  const setHeight = vi.fn();
  const onSubmit = vi.fn(async (event: React.FormEvent) => {
    event.preventDefault();
  });

  renderElement(
    <ViewportPresetEditorContent
      height={720}
      isDisabled={false}
      label="Desktop"
      onSubmit={onSubmit}
      setHeight={setHeight}
      setLabel={setLabel}
      setWidth={setWidth}
      width={1280}
    />
  );
  const inputs = Array.from(container?.querySelectorAll<HTMLInputElement>('input') ?? []);
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

  act(() => {
    setValue?.call(inputs[0], 'Wide');
    inputs[0]!.dispatchEvent(new Event('input', { bubbles: true }));
    setValue?.call(inputs[1], '9999');
    inputs[1]!.dispatchEvent(new Event('input', { bubbles: true }));
    setValue?.call(inputs[2], '0');
    inputs[2]!.dispatchEvent(new Event('input', { bubbles: true }));
    container
      ?.querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });

  expect(setLabel).toHaveBeenCalledWith('Wide');
  expect(setWidth).toHaveBeenCalledWith(3840);
  expect(setHeight).toHaveBeenCalledWith(1);
  expect(onSubmit).toHaveBeenCalled();
}

function verifyViewportPresetEditorFooter() {
  const onClose = vi.fn();
  const onSubmit = vi.fn();

  renderElement(
    <div>
      <ViewportPresetEditorFooter
        disabled={false}
        isSaving={false}
        label="Desktop"
        onClose={onClose}
        onSubmit={onSubmit}
      />
      <ViewportPresetEditorFooter
        disabled={true}
        isSaving={true}
        label="Desktop"
        onClose={onClose}
        onSubmit={onSubmit}
        preset={{ id: 'preset-1', label: 'Desktop', width: 1280, height: 720 }}
      />
    </div>
  );

  const buttons = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []);

  act(() => {
    buttons[0]?.click();
    buttons[1]?.click();
  });

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(container?.textContent).toContain(translate('viewportPresets.editor.create'));
  expect(container?.textContent).toContain(translate('viewportPresets.editor.saving'));
  expect(buttons[1]?.disabled).toBe(false);
  expect(buttons[3]?.disabled).toBe(true);
  expect(actionButtonPropsSpy).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ tone: 'primary', type: 'submit' })
  );
  expect(actionButtonPropsSpy.mock.calls[1]?.[0]).not.toHaveProperty('compact');
}

function verifyViewportPresetEditorFooterDisablesBlankLabels() {
  renderElement(
    <ViewportPresetEditorFooter
      disabled={false}
      isSaving={false}
      label="   "
      onClose={vi.fn()}
      onSubmit={vi.fn()}
    />
  );

  const submitButton = Array.from(
    container?.querySelectorAll<HTMLButtonElement>('button') ?? []
  )[1];
  expect(submitButton?.disabled).toBe(true);
}

function runViewportPresetEditorViewsSuite() {
  it(
    'wires name and dimension setters and submits the editor form',
    verifyViewportPresetEditorContent
  );
  it('renders footer action labels for create and saving states', verifyViewportPresetEditorFooter);
  it(
    'disables submit when the viewport preset label is blank',
    verifyViewportPresetEditorFooterDisablesBlankLabels
  );
}

describe('viewport-preset-editor.views', runViewportPresetEditorViewsSuite);
