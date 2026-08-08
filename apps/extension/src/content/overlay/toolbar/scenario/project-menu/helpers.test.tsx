// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useScenarioProjectMenuStyle } from './helpers';

const { useContentUiScaleMock } = vi.hoisted(() => ({
  useContentUiScaleMock: vi.fn(() => 0.5),
}));

vi.mock('../../../../platform/dom-host', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/dom-host')>()),
  useContentUiScale: useContentUiScaleMock,
}));

function MenuStyleHarness(props: { anchorEl: HTMLButtonElement }) {
  const style = useScenarioProjectMenuStyle({
    anchorEl: props.anchorEl,
    displayMode: 'horizontal',
    isOpen: true,
    sidebarVisible: false,
  });
  return <output data-style={JSON.stringify(style)} />;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

it('positions the scenario project menu in the zoom-independent viewport', () => {
  vi.stubGlobal('innerWidth', 600);
  vi.stubGlobal('innerHeight', 450);
  const anchor = document.createElement('button');
  vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({
    bottom: 70,
    height: 20,
    left: 250,
    right: 270,
    top: 50,
    width: 20,
    x: 250,
    y: 50,
    toJSON: () => ({}),
  });
  document.body.append(anchor);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<MenuStyleHarness anchorEl={anchor} />));

  const style = JSON.parse(container.querySelector('output')?.dataset['style'] ?? '{}') as {
    left?: number;
    top?: number;
    width?: number;
  };
  expect(style).toMatchObject({ left: 94, top: 76, width: 352 });
  act(() => root.unmount());
});
