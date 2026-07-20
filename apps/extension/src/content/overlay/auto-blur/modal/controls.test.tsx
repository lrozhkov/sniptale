// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BlurSettings } from '../../../../features/highlighter/contracts';
import { getControlSegmentedOptionClassName } from '@sniptale/ui/control-language';

const translations = {
  'content.autoBlur.blurStrength': 'Сила',
  'content.autoBlur.showBorder': 'Показывать границу',
  'content.overlayControls.blurTypeDistortion': 'Волна',
  'content.overlayControls.blurTypeGaussian': 'Гаусс',
  'content.overlayControls.blurTypeLabel': 'Тип размытия',
  'content.overlayControls.blurTypeSolid': 'Маркер',
} as const;

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: keyof typeof translations) => translations[key] ?? key,
}));

vi.mock('@sniptale/ui/product-form-controls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-form-controls')>()),
  ProductRange: (props: {
    max: number;
    min: number;
    onChange: (event: { target: { value: string } }) => void;
    value: number;
  }) => (
    <input
      type="range"
      min={props.min}
      max={props.max}
      value={props.value}
      onChange={(event) => props.onChange({ target: { value: event.currentTarget.value } })}
    />
  ),
  ProductToggle: (props: { checked: boolean; onClick: () => void; size: 'sm' | 'md' }) => (
    <button
      type="button"
      aria-pressed={props.checked}
      data-size={props.size}
      onClick={props.onClick}
    >
      toggle
    </button>
  ),
}));

import { AutoBlurBlurControls } from './controls';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createBlurSettings(overrides: Partial<BlurSettings> = {}): BlurSettings {
  return {
    amount: 12,
    blurType: 'distortion',
    showBorder: false,
    ...overrides,
  };
}

async function renderControls(props?: {
  blurSettings?: BlurSettings;
  setBlurSettings?: (settings: BlurSettings) => void;
}) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  const blurSettings = props?.blurSettings ?? createBlurSettings();
  const setBlurSettings = props?.setBlurSettings ?? vi.fn();

  await act(async () => {
    root?.render(
      <AutoBlurBlurControls blurSettings={blurSettings} setBlurSettings={setBlurSettings} />
    );
  });

  return { blurSettings, setBlurSettings };
}

function findButton(label: string): HTMLButtonElement | undefined {
  return Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(
    (button) => button.textContent?.trim() === label
  );
}

function clickButton(label: string) {
  const button = findButton(label);

  act(() => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  return button;
}

function expectButtonToUseTileContract(button: HTMLButtonElement | undefined) {
  const expectedClassName = getControlSegmentedOptionClassName({
    active: true,
    density: 'default',
    layout: 'tile',
  });

  expect(button).toBeDefined();

  for (const token of expectedClassName.split(' ')) {
    expect(button?.className).toContain(token);
  }
}

async function expectSegmentedTileSelectorContract() {
  await renderControls();

  const group = container?.querySelector('[role="group"]');
  const buttons = Array.from(group?.querySelectorAll<HTMLButtonElement>('button') ?? []);
  const selectedButton = findButton('Волна');

  expect(group?.getAttribute('aria-label')).toBe('Тип размытия');
  expect(buttons).toHaveLength(3);
  expectButtonToUseTileContract(selectedButton);
  expect(selectedButton?.getAttribute('aria-pressed')).toBe('true');

  for (const button of buttons) {
    expect(button.className).not.toContain('sniptale-btn');
    expect(button.className).not.toContain('sniptale-btn-primary');
    expect(button.className).not.toContain('sniptale-btn-ghost');
  }
}

async function expectBlurTypeUpdates() {
  const setBlurSettings = vi.fn();
  const blurSettings = createBlurSettings({ blurType: 'solid' });
  await renderControls({ blurSettings, setBlurSettings });

  clickButton('Гаусс');
  clickButton('Волна');
  clickButton('Маркер');

  expect(setBlurSettings).toHaveBeenNthCalledWith(1, {
    amount: 12,
    blurType: 'gaussian',
    showBorder: false,
  });
  expect(setBlurSettings).toHaveBeenNthCalledWith(2, {
    amount: 12,
    blurType: 'distortion',
    showBorder: false,
  });
  expect(setBlurSettings).toHaveBeenNthCalledWith(3, {
    amount: 12,
    blurType: 'solid',
    showBorder: false,
  });
}

function runAutoBlurControlsSuite() {
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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

  it(
    'renders the blur selector as three shared segmented tile buttons with selected aria state',
    expectSegmentedTileSelectorContract
  );
  it(
    'updates blurType through the existing blur settings controller contract',
    expectBlurTypeUpdates
  );
}

describe('auto-blur-modal/controls', runAutoBlurControlsSuite);
