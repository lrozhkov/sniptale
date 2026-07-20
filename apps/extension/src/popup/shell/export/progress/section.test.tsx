// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const exportProgressSectionViewMock = vi.hoisted(() => vi.fn((_props: unknown) => null));

vi.mock('./view', () => ({
  ExportProgressSectionView: (props: unknown) => {
    exportProgressSectionViewMock(props);
    return <div data-testid="progress-view" />;
  },
}));

import { ExportProgressSection } from './section';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderNode(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(node);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  exportProgressSectionViewMock.mockReset();
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

describe('ExportProgressSection', () => {
  it('forwards props to the section view', async () => {
    const props: React.ComponentProps<typeof ExportProgressSection> = {
      isExporting: true,
      onCancel: vi.fn(),
      progress: {
        current: 0,
        errors: [],
        message: '',
        phase: 'idle',
        total: 0,
      },
      progressSteps: [],
      result: null,
    };

    await renderNode(<ExportProgressSection {...props} />);

    expect(exportProgressSectionViewMock).toHaveBeenCalledWith(props);
  });
});
