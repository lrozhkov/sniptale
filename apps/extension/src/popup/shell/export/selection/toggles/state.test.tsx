// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePopupExportPreferenceState } from './state';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof usePopupExportPreferenceState> | null = null;

function StateHarness() {
  latestState = usePopupExportPreferenceState();
  return null;
}

async function renderHarness() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<StateHarness />);
  });
}

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
  latestState = null;
  vi.unstubAllGlobals();
});

describe('usePopupExportPreferenceState', () => {
  it('initializes export preferences with expected defaults', async () => {
    await renderHarness();

    expect(latestState?.values.includeJson).toBe(true);
    expect(latestState?.values.includeMarkdown).toBe(true);
    expect(latestState?.values.includeFiles).toBe(true);
    expect(latestState?.values.includeImages).toBe(true);
    expect(latestState?.values.includeBasicLogs).toBe(false);
  });

  it('updates individual preferences independently', async () => {
    await renderHarness();

    await act(async () => {
      latestState?.actions.setIncludeFiles(false);
      latestState?.actions.setIncludeBasicLogs(true);
    });

    expect(latestState?.values.includeFiles).toBe(false);
    expect(latestState?.values.includeBasicLogs).toBe(true);
    expect(latestState?.values.includeJson).toBe(true);
  });
});
