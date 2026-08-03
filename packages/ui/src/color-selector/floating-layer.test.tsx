// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ColorSelectorFloatingLayer, useColorSelectorLayerStyle } from './floating-layer';

function LayerStyleProbe(props: { anchor: HTMLElement | null; open: boolean }) {
  const style = useColorSelectorLayerStyle(props.anchor, props.open);
  return <output data-style={JSON.stringify(style)} />;
}

it('contains wheel input inside the floating color surface', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <ColorSelectorFloatingLayer
        layerRef={{ current: null }}
        ownerId="color-owner"
        portalTheme="dark"
        style={{}}
        ui="test.color-layer"
      >
        Colors
      </ColorSelectorFloatingLayer>
    );
  });
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 80 });
  const hostPointerDown = vi.fn();
  document.body.addEventListener('pointerdown', hostPointerDown);

  const layer = container.querySelector('[data-ui="test.color-layer"]');
  layer?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
  layer?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  layer?.dispatchEvent(event);

  expect(event.defaultPrevented).toBe(true);
  expect(hostPointerDown).not.toHaveBeenCalled();
  document.body.removeEventListener('pointerdown', hostPointerDown);
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('positions an open selector above a low anchor and keeps a closed selector bounded', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(500);
  vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(500);
  const anchor = document.createElement('button');
  vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({
    bottom: 470,
    height: 20,
    left: 460,
    right: 480,
    top: 450,
    width: 20,
    x: 460,
    y: 450,
    toJSON: () => ({}),
  });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);

  act(() => root.render(<LayerStyleProbe anchor={anchor} open />));
  expect(container.querySelector('output')?.dataset['style']).toContain('translateY(-100%)');

  act(() => root.render(<LayerStyleProbe key="closed" anchor={null} open={false} />));
  expect(container.querySelector('output')?.dataset['style']).toContain('224');

  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('renders a floating layer without a theme attribute', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <ColorSelectorFloatingLayer
        layerRef={{ current: null }}
        ownerId="color-owner"
        portalTheme={null}
        style={{ left: 12 }}
        ui="test.color-layer"
      >
        Colors
      </ColorSelectorFloatingLayer>
    );
  });

  expect(container.querySelector('[data-ui="test.color-layer"]')?.hasAttribute('data-theme')).toBe(
    false
  );

  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
