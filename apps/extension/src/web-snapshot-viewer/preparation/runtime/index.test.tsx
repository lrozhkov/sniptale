// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { WebSnapshotManifest } from '@sniptale/runtime-contracts/web-snapshot';
import { createPagePackageManifestFixture } from '../../../features/web-snapshot/manifest.test-support';
import type { PreparationSurfaceProps } from '../../../content/public/preparation-surface';

const mocks = vi.hoisted(() => ({
  surfaceProps: null as PreparationSurfaceProps | null,
}));

vi.mock('../../../content/public/preparation-surface', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../content/public/preparation-surface')>()),
  PreparationSurface: (props: PreparationSurfaceProps) => {
    mocks.surfaceProps = props;
    return <div />;
  },
}));
vi.mock('../capture/adapter', () => ({
  createViewerScreenshotCaptureAdapter: vi.fn(() => ({ capture: vi.fn() })),
}));
vi.mock('../export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../export')>()),
  useViewerPopupExportHandler: () => vi.fn(),
}));
vi.mock('../port', () => ({ connectViewerPreparationPort: vi.fn() }));
vi.mock('../scenario/descriptors', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../scenario/descriptors')>()),
  createViewerScenarioCaptureSourceAdapter: vi.fn(),
}));
vi.mock('../scenario/listeners', () => ({
  createViewerScenarioAutoClickListenerRegistry: vi.fn(),
}));
vi.mock('./source', () => ({ createViewerAiPickSourceResolver: vi.fn() }));
vi.mock('../surface/controller', () => ({ waitForViewerSurfaceCommit: vi.fn() }));

import { ViewerPreparationRuntime } from '.';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.surfaceProps = null;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('does not expose viewer-local viewport mutation for window-only presets', () => {
  const onViewportChange = vi.fn();
  act(() => {
    root.render(
      <ViewerPreparationRuntime
        iframe={document.createElement('iframe')}
        manifest={createManifest()}
        onViewportChange={onViewportChange}
      />
    );
  });

  expect(mocks.surfaceProps?.onViewportChange).toBe(onViewportChange);
  expect(mocks.surfaceProps?.ports.mutateViewport).toBeUndefined();
});

function createManifest(): WebSnapshotManifest {
  return createPagePackageManifestFixture({
    source: { faviconUrl: null, title: 'Snapshot', url: 'https://example.test' },
  });
}
