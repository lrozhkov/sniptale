// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { rangePropsSpy, switchPropsSpy } = vi.hoisted(() => ({
  rangePropsSpy: vi.fn(),
  switchPropsSpy: vi.fn(),
}));

vi.mock('@sniptale/ui/product-form-controls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-form-controls')>()),
  ProductRange: (props: { className?: string; max?: number; min?: number; value?: number }) => {
    rangePropsSpy(props);
    return <div data-testid="range" data-class={props.className} />;
  },
}));

vi.mock('@sniptale/ui/product-glass-controls', () => ({
  ProductGlassSwitch: (props: {
    className?: string;
    on?: boolean;
    onClick?: () => void;
    'data-density'?: 'sm' | 'md';
  }) => {
    switchPropsSpy(props);
    return (
      <button
        data-testid="switch"
        aria-pressed={props.on}
        className={props.className}
        onClick={props.onClick}
      >
        switch
      </button>
    );
  },
}));

import {
  SettingsControlRow,
  SettingsDragHandle,
  SettingsRange,
  SettingsSwitch,
} from './panel-controls';

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
  rangePropsSpy.mockReset();
  switchPropsSpy.mockReset();
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

function verifySettingsSwitchAndRange() {
  const onClick = vi.fn();

  renderElement(
    <div>
      <SettingsSwitch checked onClick={onClick} className="custom-switch" />
      <SettingsRange min={0} max={10} value={5} className="custom-range" />
    </div>
  );

  act(() => {
    container?.querySelector<HTMLButtonElement>('[data-testid="switch"]')?.click();
  });

  expect(onClick).toHaveBeenCalledTimes(1);
  expect(switchPropsSpy).toHaveBeenLastCalledWith(
    expect.objectContaining({
      on: true,
      className: expect.stringContaining('custom-switch'),
      'data-density': 'md',
    })
  );
  expect(rangePropsSpy).toHaveBeenLastCalledWith(
    expect.objectContaining({
      className: expect.stringContaining('custom-range'),
      min: 0,
      max: 10,
      value: 5,
    })
  );
}

function verifyDragHandleRendering() {
  renderElement(<SettingsDragHandle className="handle-class" />);

  expect(container?.querySelector('div')?.className).toContain('handle-class');
  expect(container?.querySelector('svg')).toBeTruthy();
}

function runSettingsPanelControlsSuite() {
  it(
    'passes switch and range props through to the shared matte controls',
    verifySettingsSwitchAndRange
  );
  it('renders the drag handle with caller-provided classes', verifyDragHandleRendering);
  it('keeps a text parameter name passive and leaves direct editing available', () => {
    renderElement(
      <SettingsControlRow label="Name">
        <input aria-label="Name" defaultValue="Draft" />
      </SettingsControlRow>
    );
    const field = container!.querySelector('input')!;
    const name = container!.querySelector<HTMLElement>('.sniptale-parameter-name')!;
    act(() => name.click());
    expect(document.activeElement).not.toBe(field);
    act(() => field.focus());
    expect(document.activeElement).toBe(field);
    expect(field.value).toBe('Draft');
  });
  it('opens a dropdown only from its control rather than its name or row gap', () => {
    const open = vi.fn();
    renderElement(
      <SettingsControlRow label="Language">
        <button aria-haspopup="listbox" onClick={open}>
          English
        </button>
      </SettingsControlRow>
    );
    act(() => container!.querySelector<HTMLElement>('.sniptale-parameter-row')!.click());
    act(() => container!.querySelector<HTMLElement>('.sniptale-parameter-name')!.click());
    expect(open).not.toHaveBeenCalled();
    act(() => container!.querySelector('button')!.click());
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('keeps labels, descriptions, and controls in one shared compact row contract', () => {
    renderElement(
      <SettingsControlRow label="Language" description="Used throughout the application">
        <button type="button">Choose</button>
      </SettingsControlRow>
    );

    const row = container?.querySelector('[data-ui="settings.control-row"]');
    expect(row?.textContent).toContain('Language');
    expect(row?.textContent).toContain('Used throughout the application');
    expect(row?.className).toContain('max-w-[560px]');
    expect(row?.querySelector('.sniptale-parameter-name')?.textContent).toBe('Language');
    expect(row?.querySelector('.sniptale-parameter-value button')?.textContent).toBe('Choose');
  });
}

describe('settings-panel-controls', runSettingsPanelControlsSuite);
