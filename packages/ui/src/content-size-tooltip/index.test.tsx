// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContentSizeTooltipProps } from './types';

const { contentPropsSpy } = vi.hoisted(() => ({
  contentPropsSpy: vi.fn(),
}));

vi.mock('./views', () => ({
  ContentSizeTooltipContent: (
    props: ContentSizeTooltipProps & { canToggleAspectRatio: boolean }
  ) => {
    contentPropsSpy(props);
    return (
      <div data-testid="tooltip-content" data-can-toggle={String(props.canToggleAspectRatio)}>
        Tooltip content
      </div>
    );
  },
}));

import { ContentSizeTooltip } from './index';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createProps(overrides: Partial<ContentSizeTooltipProps> = {}): ContentSizeTooltipProps {
  return {
    copy: {
      cancel: 'Cancel',
      confirm: 'Apply',
      decreaseHeight: 'Decrease height',
      decreaseWidth: 'Decrease width',
      heightField: 'Height',
      increaseHeight: 'Increase height',
      increaseWidth: 'Increase width',
      keepAspectRatio: 'Keep aspect ratio',
      widthField: 'Width',
    },
    heightMax: 600,
    heightMin: 120,
    heightValue: 240,
    maintainAspectRatio: true,
    onCancel: vi.fn(),
    onConfirm: vi.fn(),
    onHeightChangeCommit: vi.fn(),
    onHeightChangeRaw: vi.fn(),
    onHeightDecrease: vi.fn(),
    onHeightIncrease: vi.fn(),
    onToggleAspectRatio: vi.fn(),
    onWidthChangeCommit: vi.fn(),
    onWidthChangeRaw: vi.fn(),
    onWidthDecrease: vi.fn(),
    onWidthIncrease: vi.fn(),
    position: { x: 25, y: 15 },
    widthMax: 800,
    widthMin: 100,
    widthValue: 320,
    ...overrides,
  };
}

function renderTooltip(overrides: Partial<ContentSizeTooltipProps> = {}) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  const props = createProps(overrides);

  act(() => {
    root?.render(<ContentSizeTooltip {...props} />);
  });

  return props;
}

function getTooltipSurface() {
  return container?.querySelector<HTMLDivElement>('.sniptale-content-size-tooltip') ?? null;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  contentPropsSpy.mockReset();
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

describe('ContentSizeTooltip', () => {
  it('passes true as the default aspect-ratio toggle flag and renders theme positioning', () => {
    renderTooltip({ portalTheme: 'dark' });

    const surface = getTooltipSurface();

    expect(contentPropsSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ canToggleAspectRatio: true })
    );
    expect(surface?.dataset['theme']).toBe('dark');
    expect(surface?.style.top).toBe('15px');
    expect(surface?.style.left).toBe('25px');
    expect(container?.querySelector('style')?.textContent).toBeTruthy();
  });

  it('passes explicit aspect-ratio toggle values through to the content view', () => {
    renderTooltip({ canToggleAspectRatio: false });

    expect(contentPropsSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ canToggleAspectRatio: false })
    );
  });
});

describe('ContentSizeTooltip interactions', () => {
  it('stops click and mouse-down propagation on the tooltip surface', () => {
    const parentMouseDown = vi.fn();
    const parentClick = vi.fn();
    const props = createProps();

    if (!container) {
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
    }

    act(() => {
      root?.render(
        <div onMouseDown={parentMouseDown} onClick={parentClick}>
          <ContentSizeTooltip {...props} />
        </div>
      );
    });

    act(() => {
      getTooltipSurface()?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      getTooltipSurface()?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(parentMouseDown).not.toHaveBeenCalled();
    expect(parentClick).not.toHaveBeenCalled();
  });
});
