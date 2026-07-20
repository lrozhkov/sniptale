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
  ProductToggle: (props: {
    className?: string;
    checked?: boolean;
    onClick?: () => void;
    size?: 'sm' | 'md';
  }) => {
    switchPropsSpy(props);
    return (
      <button
        data-testid="switch"
        aria-pressed={props.checked}
        className={props.className}
        onClick={props.onClick}
      >
        switch
      </button>
    );
  },
}));

import {
  getSettingsHoverActionsClassName,
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

function verifyHoverActionsClassNames() {
  expect(getSettingsHoverActionsClassName(true)).toContain('opacity-100');
  expect(getSettingsHoverActionsClassName(false)).toContain('group-hover:opacity-100');
}

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
      checked: true,
      className: expect.stringContaining('custom-switch'),
      size: 'md',
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
    'builds hover-action class names for visible and deferred states',
    verifyHoverActionsClassNames
  );
  it(
    'passes switch and range props through to the shared matte controls',
    verifySettingsSwitchAndRange
  );
  it('renders the drag handle with caller-provided classes', verifyDragHandleRendering);
}

describe('settings-panel-controls', runSettingsPanelControlsSuite);
