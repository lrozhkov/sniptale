// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VideoProjectAssetType, type VideoProject } from '../../../features/video/project/types';
import type {
  TimelineClipPreviewMap,
  TimelinePreviewViewport,
} from '../../contracts/timeline-preview';
import type { TimelineVideoFrameLoadResult } from './timeline-frame-loader';
import {
  createLoadedFrame,
  createMovedSplitDuplicateProject,
  createProjectWithVisualClip,
  createTrimmedProject,
  getLoadedSourceTimes,
  getPlannedVideoSlotCount,
  resolveLoadedFrames,
} from './timeline-previews.test-support';
import { useTimelineClipPreviews, type TimelineVideoFrameLoader } from './timeline-previews';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(),
    revokeObjectURL: vi.fn(),
  });
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

it('reuses image asset urls without owning their cleanup', async () => {
  const onPreviewsChange = vi.fn();
  const loader = vi.fn<TimelineVideoFrameLoader>();
  await renderHarness({
    assetUrls: { 'asset-image': 'blob:image' },
    loadVideoFrames: loader,
    onPreviewsChange,
    project: createProjectWithVisualClip(VideoProjectAssetType.IMAGE),
  });
  expect(onPreviewsChange).toHaveBeenLastCalledWith({
    'clip-1': { kind: 'image', urls: ['blob:image'] },
  });
  expect(loader).not.toHaveBeenCalled();
  act(() => {
    root?.unmount();
  });

  expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:image');
});

it('loads video preview frames from source-anchored asset slots', async () => {
  const onPreviewsChange = vi.fn();
  const loader = vi.fn<TimelineVideoFrameLoader>().mockImplementation(resolveLoadedFrames);

  await renderHarness({
    assetUrls: { 'asset-video': 'blob:video' },
    loadVideoFrames: loader,
    onPreviewsChange,
    project: createProjectWithVisualClip(VideoProjectAssetType.VIDEO),
  });

  expect(getLoadedSourceTimes(loader)).toEqual([0]);
  expect(onPreviewsChange).toHaveBeenLastCalledWith({
    'clip-1': { kind: 'video', urls: ['blob:frame-0'] },
  });
});

it('does not regenerate previews when zoom changes but source slots stay unchanged', async () => {
  const onPreviewsChange = vi.fn();
  const loader = vi.fn<TimelineVideoFrameLoader>().mockImplementation(resolveLoadedFrames);
  const project = createProjectWithVisualClip(VideoProjectAssetType.VIDEO, { duration: 30 });

  await renderHarness({
    assetUrls: { 'asset-video': 'blob:video' },
    loadVideoFrames: loader,
    onPreviewsChange,
    project,
    viewport: { endTime: 10, startTime: 0 },
  });
  await renderHarness({
    assetUrls: { 'asset-video': 'blob:video' },
    loadVideoFrames: loader,
    onPreviewsChange,
    project,
    viewport: { endTime: 10, startTime: 0 },
  });

  expect(loader).toHaveBeenCalledTimes(1);
});

it('reuses generated source slots when clips are moved split or duplicated', async () => {
  const onPreviewsChange = vi.fn();
  const loader = vi.fn<TimelineVideoFrameLoader>().mockImplementation(resolveLoadedFrames);
  const project = createProjectWithVisualClip(VideoProjectAssetType.VIDEO, { duration: 30 });

  await renderHarness({
    assetUrls: { 'asset-video': 'blob:video' },
    loadVideoFrames: loader,
    onPreviewsChange,
    project,
  });
  await renderHarness({
    assetUrls: { 'asset-video': 'blob:video' },
    loadVideoFrames: loader,
    onPreviewsChange,
    project: createMovedSplitDuplicateProject(project),
  });

  expect(loader).toHaveBeenCalledTimes(1);
  expect(onPreviewsChange).toHaveBeenLastCalledWith({
    'clip-1-a': { kind: 'video', urls: ['blob:frame-0'] },
    'clip-1-b': { kind: 'video', urls: ['blob:frame-0'] },
    'clip-1-copy': { kind: 'video', urls: ['blob:frame-0'] },
  });
});

it('loads only newly exposed source slots after an outward trim', async () => {
  const onPreviewsChange = vi.fn();
  const loader = vi.fn<TimelineVideoFrameLoader>().mockImplementation(resolveLoadedFrames);
  const project = createProjectWithVisualClip(VideoProjectAssetType.VIDEO, { duration: 30 });

  await renderHarness({
    assetUrls: { 'asset-video': 'blob:video' },
    loadVideoFrames: loader,
    onPreviewsChange,
    project,
  });
  await renderHarness({
    assetUrls: { 'asset-video': 'blob:video' },
    loadVideoFrames: loader,
    onPreviewsChange,
    project: createTrimmedProject(project, { sourceDuration: 26 }),
  });

  expect(getLoadedSourceTimes(loader)).toEqual([0, 12, 24]);
});

it('hides inward-trimmed source slots without regenerating overlapping previews', async () => {
  const onPreviewsChange = vi.fn();
  const loader = vi.fn<TimelineVideoFrameLoader>().mockImplementation(resolveLoadedFrames);
  const project = createProjectWithVisualClip(VideoProjectAssetType.VIDEO, { duration: 30 });

  await renderHarness({
    assetUrls: { 'asset-video': 'blob:video' },
    loadVideoFrames: loader,
    onPreviewsChange,
    project: createTrimmedProject(project, { sourceDuration: 26 }),
  });
  await renderHarness({
    assetUrls: { 'asset-video': 'blob:video' },
    loadVideoFrames: loader,
    onPreviewsChange,
    project,
  });

  expect(loader).toHaveBeenCalledTimes(1);
  expect(onPreviewsChange).toHaveBeenLastCalledWith({
    'clip-1': { kind: 'video', urls: ['blob:frame-0'] },
  });
});

it('keeps missing previews paused while preview generation is suspended', async () => {
  const onPreviewsChange = vi.fn();
  const loader = vi.fn<TimelineVideoFrameLoader>().mockImplementation(resolveLoadedFrames);

  await renderHarness({
    assetUrls: { 'asset-video': 'blob:video' },
    loadVideoFrames: loader,
    onPreviewsChange,
    project: createProjectWithVisualClip(VideoProjectAssetType.VIDEO),
    suspended: true,
  });

  expect(loader).not.toHaveBeenCalled();
  expect(onPreviewsChange).toHaveBeenLastCalledWith({});
});

it('keeps long assets lazy by loading storyboard frames in small batches', async () => {
  const onPreviewsChange = vi.fn();
  const loader = vi.fn<TimelineVideoFrameLoader>().mockImplementation(resolveLoadedFrames);
  const project = createProjectWithVisualClip(VideoProjectAssetType.VIDEO, { duration: 300 });

  expect(getPlannedVideoSlotCount(project)).toBe(25);

  await renderHarness({
    assetUrls: { 'asset-video': 'blob:video' },
    loadVideoFrames: loader,
    onPreviewsChange,
    project,
  });

  expect(loader.mock.calls[0]?.[0].samples).toHaveLength(6);
  expect(loader.mock.calls[0]?.[0].samples.map((sample) => sample.sourceTime)).toEqual([
    0, 12, 24, 36, 48, 60,
  ]);
});

it('does not let stale video preview runs overwrite the current asset url', async () => {
  const onPreviewsChange = vi.fn();
  const loaderCalls: Array<(frames: readonly TimelineVideoFrameLoadResult[]) => void> = [];
  const loader = vi.fn<TimelineVideoFrameLoader>(
    () => new Promise((resolve) => loaderCalls.push(resolve))
  );

  await renderHarness({
    assetUrls: { 'asset-video': 'blob:old' },
    loadVideoFrames: loader,
    onPreviewsChange,
    project: createProjectWithVisualClip(VideoProjectAssetType.VIDEO),
  });
  await renderHarness({
    assetUrls: { 'asset-video': 'blob:new' },
    loadVideoFrames: loader,
    onPreviewsChange,
    project: createProjectWithVisualClip(VideoProjectAssetType.VIDEO),
  });

  await act(async () => {
    loaderCalls[0]?.([createLoadedFrame(loader.mock.calls[0]![0], 0, 'blob:old-frame')]);
    await Promise.resolve();
  });
  expect(onPreviewsChange).not.toHaveBeenLastCalledWith({
    'clip-1': { kind: 'video', urls: ['blob:old-frame'] },
  });
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:old-frame');

  await act(async () => {
    loaderCalls[1]?.([createLoadedFrame(loader.mock.calls[1]![0], 0, 'blob:new-frame')]);
    await Promise.resolve();
  });
  expect(onPreviewsChange).toHaveBeenLastCalledWith({
    'clip-1': { kind: 'video', urls: ['blob:new-frame'] },
  });
});

it('revokes hook-owned video preview urls when the asset url is removed', async () => {
  const onPreviewsChange = vi.fn();
  const loader = vi.fn<TimelineVideoFrameLoader>().mockImplementation(resolveLoadedFrames);

  await renderHarness({
    assetUrls: { 'asset-video': 'blob:video' },
    loadVideoFrames: loader,
    onPreviewsChange,
    project: createProjectWithVisualClip(VideoProjectAssetType.VIDEO),
  });
  await renderHarness({
    assetUrls: {},
    loadVideoFrames: loader,
    onPreviewsChange,
    project: createProjectWithVisualClip(VideoProjectAssetType.VIDEO),
  });

  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:frame-0');
  expect(onPreviewsChange).toHaveBeenLastCalledWith({});
});

function TimelinePreviewHarness(props: {
  assetUrls: Record<string, string>;
  loadVideoFrames: TimelineVideoFrameLoader;
  onPreviewsChange: (previews: TimelineClipPreviewMap) => void;
  project: VideoProject;
  suspended?: boolean;
  viewport?: TimelinePreviewViewport;
}) {
  const previews = useTimelineClipPreviews(props.project, props.assetUrls, {
    loadVideoFrames: props.loadVideoFrames,
    suspended: props.suspended ?? false,
    viewport: props.viewport ?? null,
  });
  const { onPreviewsChange } = props;

  useEffect(() => {
    onPreviewsChange(previews);
  }, [onPreviewsChange, previews]);

  return null;
}

async function renderHarness(props: React.ComponentProps<typeof TimelinePreviewHarness>) {
  await act(async () => {
    root?.render(<TimelinePreviewHarness {...props} />);
    await Promise.resolve();
    await Promise.resolve();
  });
}
