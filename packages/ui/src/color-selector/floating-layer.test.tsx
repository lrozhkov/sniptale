// @vitest-environment jsdom

import { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ColorSelectorFloatingLayer, useColorSelectorLayerStyle } from './floating-layer';

function LayerStyleProbe(props: { anchor: HTMLElement | null; open: boolean }) {
  const style = useColorSelectorLayerStyle(props.anchor, props.open);
  return <output data-style={JSON.stringify(style)} />;
}

function TallLayerStyleProbe(props: { anchor: HTMLElement }) {
  const layerRef = useRef(document.createElement('div'));
  const style = useColorSelectorLayerStyle(
    props.anchor,
    true,
    'auto',
    null,
    layerRef,
    'palette',
    680
  );
  return <output data-style={JSON.stringify(style)} />;
}

it('opens a tall paint selector above when the lower space would truncate it', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(900);
  vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(900);
  const anchor = document.createElement('button');
  vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({
    bottom: 510,
    height: 20,
    left: 300,
    right: 320,
    top: 490,
    width: 20,
    x: 300,
    y: 490,
    toJSON: () => ({}),
  });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<TallLayerStyleProbe anchor={anchor} />));
  expect(host.querySelector('output')?.dataset['style']).toContain('translateY(-100%)');
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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

function MeasuredSideProbe({ anchor, layer }: { anchor: HTMLElement; layer: HTMLDivElement }) {
  const layerRef = useRef(layer);
  const style = useColorSelectorLayerStyle(anchor, true, 'side', null, layerRef);
  return <output data-top={style.top} />;
}
it('uses measured palette height and follows ancestor scrolling near the viewport bottom', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1000);
  vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);
  const host = document.createElement('div');
  const anchor = document.createElement('button');
  const layer = document.createElement('div');
  host.append(anchor);
  document.body.append(host);
  let top = 560;
  vi.spyOn(anchor, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(800, top, 160, 32)
  );
  vi.spyOn(layer, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 224, 180));
  const rootHost = document.createElement('div');
  document.body.append(rootHost);
  const root = createRoot(rootHost);
  act(() => root.render(<MeasuredSideProbe anchor={anchor} layer={layer} />));
  expect(rootHost.querySelector('output')?.dataset['top']).toBe('560');
  act(() => {
    top = 520;
    host.dispatchEvent(new Event('scroll'));
  });
  expect(rootHost.querySelector('output')?.dataset['top']).toBe('520');
  act(() => root.unmount());
  host.remove();
  rootHost.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function ReplacementLayerProbe(props: {
  anchor: HTMLElement;
  layerRef: { current: HTMLDivElement | null };
  kind: 'palette' | 'picker';
}) {
  useColorSelectorLayerStyle(props.anchor, true, 'side', null, props.layerRef, props.kind);
  return null;
}
it('rebinds resize observation when the palette is replaced by the picker', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const observe = vi.fn();
  const disconnect = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = observe;
      disconnect = disconnect;
    }
  );
  const host = document.createElement('div');
  document.body.append(host);
  const anchor = document.createElement('button');
  const palette = document.createElement('div');
  const picker = document.createElement('div');
  const layerRef = { current: palette };
  const root = createRoot(host);
  act(() =>
    root.render(<ReplacementLayerProbe anchor={anchor} layerRef={layerRef} kind="palette" />)
  );
  expect(observe).toHaveBeenCalledWith(palette);
  layerRef.current = picker;
  act(() =>
    root.render(<ReplacementLayerProbe anchor={anchor} layerRef={layerRef} kind="picker" />)
  );
  expect(disconnect).toHaveBeenCalledOnce();
  expect(observe).toHaveBeenCalledWith(picker);
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
