// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { useDataPanelBaseState } from './base';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useDataPanelBaseState> | null = null;

function BaseStateHarness() {
  latestState = useDataPanelBaseState();
  return null;
}

function renderHarness() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(<BaseStateHarness />);
  });
}

beforeAll(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  latestState = null;
});

describe('useDataPanelBaseState', () => {
  it('initializes the panel owner state with stable refs and empty collections', () => {
    renderHarness();

    expect(latestState).toEqual(
      expect.objectContaining({
        copied: false,
        excludedColumns: new Map(),
        isDataResizing: false,
        isDataSpoilerOpen: false,
        isJsonResizing: false,
        showDataPreview: false,
        treeState: new Map(),
      })
    );
    expect(latestState?.dataContainerRef.current).toBeNull();
    expect(latestState?.jsonPreviewRef.current).toBeNull();
  });
});
