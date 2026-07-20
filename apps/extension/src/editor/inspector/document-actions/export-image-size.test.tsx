// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { useEditorExportImageSizeState } from './export-image-size';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useEditorExportImageSizeState> | null = null;

function Harness(props: { height: number; width: number }) {
  latestState = useEditorExportImageSizeState({
    height: props.height,
    width: props.width,
  });
  return null;
}

function getState() {
  if (!latestState) {
    throw new Error('Expected export image size state');
  }

  return latestState;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
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

it('starts from the current canvas size and keeps the lock enabled', () => {
  act(() => {
    root?.render(<Harness height={720} width={1280} />);
  });

  expect(getState().draft).toEqual({ height: 720, width: 1280 });
  expect(getState().locked).toBe(true);
});

it('resets the disposable draft when the canvas size changes', () => {
  act(() => {
    root?.render(<Harness height={720} width={1280} />);
  });

  act(() => {
    getState().setWidth(1600);
  });

  expect(getState().draft).toEqual({ height: 900, width: 1600 });

  act(() => {
    root?.render(<Harness height={1080} width={1920} />);
  });

  expect(getState().draft).toEqual({ height: 1080, width: 1920 });
});
