// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const overlayMock = vi.hoisted(() =>
  vi.fn(() => ({
    menuPosition: 'bottom' as const,
    portalStyle: { top: 24 },
  }))
);

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('@sniptale/ui/theme/safe-portal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/theme/safe-portal')>()),
  useResolvedPortalTheme: () => 'portal-theme',
}));

vi.mock('@sniptale/ui/glass-select/overlay-state', () => ({
  useGlassSelectOverlay: overlayMock,
}));

vi.mock('@sniptale/ui/glass-select/styles', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/glass-select/styles')>()),
  getGlassSelectMenuSurfaceClassName: (isPopupFlat: boolean) =>
    isPopupFlat ? 'menu-flat' : 'menu-default',
  getGlassSelectTriggerClassName: (args: {
    isOpen: boolean;
    isPopupFlat: boolean;
    sizeClasses: string;
  }) =>
    [args.isOpen ? 'open' : 'closed', args.isPopupFlat ? 'flat' : 'default', args.sizeClasses].join(
      ' '
    ),
}));

import { useGlassSelectController } from './controller';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderHook<T extends string>(props: Parameters<typeof useGlassSelectController<T>>[0]) {
  let value: ReturnType<typeof useGlassSelectController<T>> | null = null;

  const Harness = () => {
    value = useGlassSelectController(props);
    return null;
  };

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<Harness />));

  return () => value;
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.clearAllMocks();
});

function registerDefaultPresentationTest() {
  it('builds default presentation state with translated placeholder and selected option', () => {
    const getValue = renderHook({
      onChange: vi.fn(),
      options: [{ label: 'One', value: 'one' }],
      value: 'one',
    });

    expect(getValue()).toMatchObject({
      isOpen: false,
      menuSizeClasses: 'py-1.5',
      menuSurfaceClassName: 'menu-default',
      placeholder: 'shared.ui.selectPlaceholder',
      portalStyle: { top: 24 },
      portalTheme: 'portal-theme',
      selectedOption: { label: 'One', value: 'one' },
      triggerClassName: expect.stringContaining('closed'),
    });
    expect(overlayMock).toHaveBeenCalledWith(
      expect.objectContaining({
        isOpen: false,
        portal: false,
      })
    );
  });
}

function registerEnabledToggleTest() {
  it('toggles open state for enabled controls and emits changes for enabled options', () => {
    const onChange = vi.fn();
    const getValue = renderHook({
      onChange,
      options: [
        { label: 'One', value: 'one' },
        { disabled: true, label: 'Two', value: 'two' },
      ],
      size: 'sm',
      value: '',
      variant: 'popup-flat',
    });

    act(() => getValue()?.handleToggle());
    expect(getValue()).toMatchObject({
      isOpen: true,
      isPopupFlat: true,
      menuSizeClasses: 'py-1',
      menuSurfaceClassName: 'menu-flat',
      triggerClassName: expect.stringContaining('flat'),
    });

    act(() => getValue()?.handleSelect({ disabled: true, label: 'Two', value: 'two' }));
    act(() => getValue()?.handleSelect({ label: 'One', value: 'one' }));

    expect(onChange).toHaveBeenCalledWith('one');
    expect(getValue()?.isOpen).toBe(false);
  });
}

function registerDisabledToggleTest() {
  it('keeps disabled controls closed and ignores toggle attempts', () => {
    const getValue = renderHook({
      disabled: true,
      onChange: vi.fn(),
      options: [{ label: 'One', value: 'one' }],
      value: '',
    });

    act(() => getValue()?.handleToggle());

    expect(getValue()?.isOpen).toBe(false);
  });
}

function registerGlassSelectControllerTests() {
  registerDefaultPresentationTest();
  registerEnabledToggleTest();
  registerDisabledToggleTest();
}

describe('glass select controller', registerGlassSelectControllerTests);
