// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useVideoEditorStore } from '../../state/store';
import { useVideoEditorActionHandlers } from '.';
import type { AssetHandlerPort, ExportHandlerPort, ProjectHandlerPort } from './types';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it('keeps each command family stable across unrelated parent renders', () => {
  const initial = useVideoEditorStore.getInitialState();
  const assets: AssetHandlerPort = {
    addAssetClip: initial.addAssetClip,
    getCurrentProject: () => null,
    getCurrentProjectId: () => null,
    getCurrentTime: () => 0,
    moveClip: initial.moveClip,
    setError: initial.setError,
    trimClipEnd: initial.trimClipEnd,
    trimClipStart: initial.trimClipStart,
    upsertAsset: initial.upsertAsset,
  };
  const exportPort: ExportHandlerPort = {
    cancelExport: initial.cancelExport,
    failExport: initial.failExport,
    failExportCancellation: initial.failExportCancellation,
    getCurrentExportState: () => initial.exportState,
    getCurrentProject: () => null,
    getCurrentSelectedClipId: () => null,
    startExport: initial.startExport,
  };
  const project: ProjectHandlerPort = {
    applyLoadedProject: vi.fn(),
    getCurrentProject: () => null,
    libraries: {
      refreshProjectExports: vi.fn().mockResolvedValue(undefined),
      refreshProjects: vi.fn().mockResolvedValue(undefined),
    },
    projects: [],
    setError: initial.setError,
  };
  const confirmHandlers = { requestConfirm: vi.fn().mockResolvedValue(false) };
  const snapshots: ReturnType<typeof useVideoEditorActionHandlers>[] = [];

  function Harness({ unrelated }: { unrelated: number }) {
    void unrelated;
    snapshots.push(
      useVideoEditorActionHandlers({ assets, export: exportPort, project }, confirmHandlers)
    );
    return null;
  }

  act(() => root.render(<Harness unrelated={0} />));
  act(() => root.render(<Harness unrelated={1} />));

  expect(snapshots).toHaveLength(2);
  expect(snapshots[1]?.assets).toBe(snapshots[0]?.assets);
  expect(snapshots[1]?.export).toBe(snapshots[0]?.export);
  expect(snapshots[1]?.project).toBe(snapshots[0]?.project);
});
