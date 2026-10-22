// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import type { ApplyLoadedProject } from './types';

const { loadInitialProjectFromLocationMock } = vi.hoisted(() => ({
  loadInitialProjectFromLocationMock: vi.fn(),
}));

vi.mock('../../project/operations/ops', async (original) => ({
  ...(await original<typeof import('../../project/operations/ops')>()),
  loadInitialProjectFromLocation: loadInitialProjectFromLocationMock,
}));

import { useVideoEditorBootstrap } from './bootstrap';
import { ReviewProjectTransferError } from '../../project/operations/ops';
import { createTranslator } from '../../../platform/i18n';

function createDeferred<T>() {
  let rejectPromise: (error: unknown) => void;
  let resolvePromise: (value: T) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    reject: rejectPromise!,
    resolve: resolvePromise!,
  };
}

function BootstrapHarness(props: {
  applyLoadedProject: ApplyLoadedProject;
  refreshProjectExports: (projectId: string | null) => Promise<void>;
  refreshProjects: () => Promise<void>;
  refreshRecordings: () => Promise<void>;
  setError: (message: string | null) => void;
  setReady: (ready: boolean) => void;
}) {
  useVideoEditorBootstrap(
    props.applyLoadedProject,
    props.setError,
    props.setReady,
    props.refreshRecordings,
    props.refreshProjects,
    props.refreshProjectExports
  );

  return null;
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  loadInitialProjectFromLocationMock.mockReset();
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function renderBootstrapHarness(props: Parameters<typeof BootstrapHarness>[0]) {
  await act(async () => {
    root?.render(<BootstrapHarness {...props} />);
  });
}

async function verifyReadyBeforeLibraryRefreshes() {
  const project = createEmptyVideoProject('Bootstrap');
  const refreshRecordings = createDeferred<void>();
  const refreshProjects = createDeferred<void>();
  const refreshProjectExports = createDeferred<void>();
  const applyLoadedProject = vi.fn<ApplyLoadedProject>();
  const setError = vi.fn();
  const setReady = vi.fn();

  loadInitialProjectFromLocationMock.mockResolvedValue({
    project,
    recordingId: 'recording-1',
  });

  await renderBootstrapHarness({
    applyLoadedProject,
    refreshProjectExports: () => refreshProjectExports.promise,
    refreshProjects: () => refreshProjects.promise,
    refreshRecordings: () => refreshRecordings.promise,
    setError,
    setReady,
  });
  await flushEffects();

  expect(applyLoadedProject).toHaveBeenCalledWith(project, 'recording-1');
  expect(setReady).toHaveBeenCalledWith(true);

  refreshRecordings.resolve();
  refreshProjects.resolve();
  refreshProjectExports.resolve();
  await flushEffects();

  expect(setError).not.toHaveBeenCalled();
  expect(setReady).toHaveBeenCalledWith(true);
}

async function verifyRefreshFailuresKeepProjectReady() {
  const project = createEmptyVideoProject('Bootstrap failure');
  const applyLoadedProject = vi.fn<ApplyLoadedProject>();
  const setError = vi.fn();
  const setReady = vi.fn();

  loadInitialProjectFromLocationMock.mockResolvedValue({
    project,
    recordingId: 'recording-2',
  });

  await renderBootstrapHarness({
    applyLoadedProject,
    refreshProjectExports: () => Promise.reject(new Error('exports failed')),
    refreshProjects: () => Promise.resolve(),
    refreshRecordings: () => Promise.resolve(),
    setError,
    setReady,
  });
  await flushEffects();

  expect(applyLoadedProject).toHaveBeenCalledWith(project, 'recording-2');
  expect(setError).not.toHaveBeenCalled();
  expect(setReady).toHaveBeenCalledWith(true);
}

describe('useVideoEditorBootstrap', () => {
  it('keeps source admission failure blocking and does not start advisory reads', async () => {
    const applyLoadedProject = vi.fn<ApplyLoadedProject>();
    const setError = vi.fn();
    const setReady = vi.fn();
    const refresh = vi.fn(async () => undefined);
    loadInitialProjectFromLocationMock.mockRejectedValue(new Error('Source unavailable'));
    await renderBootstrapHarness({
      applyLoadedProject,
      setError,
      setReady,
      refreshRecordings: refresh,
      refreshProjects: refresh,
      refreshProjectExports: refresh,
    });
    await flushEffects();
    expect(applyLoadedProject).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(setError).toHaveBeenCalledOnce();
    expect(setError.mock.calls[0]?.[0]).not.toContain('Source unavailable');
    expect(setError.mock.calls[0]?.[0]).toMatch(/Sniptale/);
    expect(setReady).toHaveBeenCalledWith(true);
  });
  it.each(['timing', 'joins', 'overlays', 'resources', 'settings'] as const)(
    'reports a %s transfer refusal without a false storage diagnosis or technical text',
    async (reason) => {
      const applyLoadedProject = vi.fn<ApplyLoadedProject>();
      const setError = vi.fn();
      const setReady = vi.fn();
      const refresh = vi.fn(async () => undefined);
      loadInitialProjectFromLocationMock.mockRejectedValue(new ReviewProjectTransferError(reason));
      await renderBootstrapHarness({
        applyLoadedProject,
        setError,
        setReady,
        refreshRecordings: refresh,
        refreshProjects: refresh,
        refreshProjectExports: refresh,
      });
      await flushEffects();
      expect(applyLoadedProject).not.toHaveBeenCalled();
      expect(refresh).not.toHaveBeenCalled();
      expect(setReady).toHaveBeenCalledWith(true);
      const message = setError.mock.calls[0]?.[0];
      expect(typeof message).toBe('string');
      expect(message).not.toContain('Review project settings cannot be transferred.');
      for (const locale of ['en', 'ru'] as const) {
        const t = createTranslator(locale);
        expect(message).not.toContain(t('common.errors.storageDetail'));
      }
      const key = {
        timing: 'videoEditor.app.transferTimingUnsupported',
        joins: 'videoEditor.app.transferJoinsUnsupported',
        overlays: 'videoEditor.app.transferOverlaysUnsupported',
        resources: 'videoEditor.app.transferResourcesUnavailable',
        settings: 'videoEditor.app.transferSettingsUnsupported',
      } as const;
      expect(
        ['en', 'ru'].map((locale) => createTranslator(locale === 'en' ? 'en' : 'ru')(key[reason]))
      ).toContain(message);
    }
  );
  it('opens an idle start page without a project write or export refresh', async () => {
    const applyLoadedProject = vi.fn<ApplyLoadedProject>();
    const setError = vi.fn();
    const setReady = vi.fn();
    const refreshProjectExports = vi.fn(async () => undefined);
    loadInitialProjectFromLocationMock.mockResolvedValue({ project: null, recordingId: null });
    await renderBootstrapHarness({
      applyLoadedProject,
      refreshProjectExports,
      refreshProjects: async () => {
        throw new Error('list unavailable');
      },
      refreshRecordings: async () => undefined,
      setError,
      setReady,
    });
    await flushEffects();
    expect(applyLoadedProject).not.toHaveBeenCalled();
    expect(refreshProjectExports).not.toHaveBeenCalled();
    expect(setError).not.toHaveBeenCalled();
    expect(setReady).toHaveBeenCalledWith(true);
  });
  it(
    'opens the admitted project before slow library refreshes finish',
    verifyReadyBeforeLibraryRefreshes
  );
  it(
    'keeps an admitted project editable when an advisory library refresh fails',
    verifyRefreshFailuresKeepProjectReady
  );
});
