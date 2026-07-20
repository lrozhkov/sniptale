// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useDesignSystemPageExplorerState } from './explorer-state';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useDesignSystemPageExplorerState> | null = null;
let currentEntries = [{ componentId: 'entry-a' }, { componentId: 'entry-b' }] as never;

function ExplorerHarness() {
  latestState = useDesignSystemPageExplorerState(currentEntries);
  return null;
}

async function renderHarness() {
  await act(async () => {
    root?.render(<ExplorerHarness />);
  });
}

describe('useDesignSystemPageExplorerState', () => {
  beforeEach(async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    currentEntries = [{ componentId: 'entry-a' }, { componentId: 'entry-b' }] as never;
    await renderHarness();
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    latestState = null;
    root = null;
    container?.remove();
    container = null;
  });

  it('keeps a single expanded entry and falls back to the first visible result after filtering', async () => {
    expect(latestState?.expandedEntryId).toBe('entry-a');

    act(() => {
      latestState?.setExpandedEntryId('entry-b');
    });

    expect(latestState?.expandedEntryId).toBe('entry-b');

    currentEntries = [{ componentId: 'entry-c' }, { componentId: 'entry-d' }] as never;
    await renderHarness();

    expect(latestState?.expandedEntryId).toBe('entry-c');
  });

  it('resets the expanded entry when no filtered results remain', async () => {
    currentEntries = [] as never;
    await renderHarness();

    expect(latestState?.expandedEntryId).toBeNull();
  });
});
