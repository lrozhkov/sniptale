// @vitest-environment jsdom
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createVideoProjectFromRecording } from '../../features/video/project/factories/creation';
import { createVideoProjectMotionRegion } from '../../features/video/project/motion';
import type { VideoProject, VideoProjectMotionRegion } from '../../features/video/project/types';
import { useMotionRegionCursorAvailable } from './cursor-availability';

function deferred() {
  let resolve!: (value: boolean) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<boolean>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
let root: Root | null, host: HTMLDivElement;
let latest = false;
const reads: ReturnType<typeof deferred>[] = [];
const available =
  vi.fn<
    (
      project: VideoProject,
      region: VideoProjectMotionRegion,
      signal?: AbortSignal
    ) => Promise<boolean>
  >();
const clear = vi.fn();
const createReader = () => ({ available, clear });
function Harness({ project, region }: { project: VideoProject; region: VideoProjectMotionRegion }) {
  latest = useMotionRegionCursorAvailable(project, region, createReader);
  return <span>{String(latest)}</span>;
}
function fixture() {
  const project = createVideoProjectFromRecording({
    recordingId: 'recording',
    filename: 'capture.webm',
    width: 100,
    height: 100,
    duration: 4,
    mimeType: 'video/webm',
    size: 10,
  });
  const region = createVideoProjectMotionRegion(project, 0);
  return { project, region };
}
beforeEach(() => {
  latest = false;
  reads.splice(0);
  available.mockReset();
  clear.mockReset();
  available.mockImplementation(() => {
    const read = deferred();
    reads.push(read);
    return read.promise;
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
  vi.restoreAllMocks();
});

it('publishes only the completed pair and never changes the authored project', async () => {
  const props = fixture(),
    before = JSON.stringify(props.project);
  await act(async () => root!.render(<Harness {...props} />));
  expect(latest).toBe(false);
  expect(available).toHaveBeenCalledOnce();
  await act(async () => reads[0]!.resolve(true));
  expect(latest).toBe(true);
  expect(JSON.stringify(props.project)).toBe(before);
  const region = { ...props.region, id: 'next' };
  await act(async () => root!.render(<Harness project={props.project} region={region} />));
  expect(latest).toBe(false);
  await act(async () => reads[1]!.resolve(false));
  expect(latest).toBe(false);
});

it('aborts stale selection and runs only the latest replaceable pending request', async () => {
  const { project, region } = fixture();
  await act(async () => root!.render(<Harness project={project} region={region} />));
  const second = { ...region, id: 'second' },
    third = { ...region, id: 'third' };
  await act(async () => root!.render(<Harness project={project} region={second} />));
  await act(async () => root!.render(<Harness project={project} region={third} />));
  expect(available).toHaveBeenCalledOnce();
  expect(available.mock.calls[0]?.[2]?.aborted).toBe(true);
  await act(async () => reads[0]!.resolve(true));
  expect(latest).toBe(false);
  expect(available).toHaveBeenCalledTimes(2);
  expect(available.mock.calls[1]?.[1]).toBe(third);
  expect(available.mock.calls[1]?.[2]?.aborted).toBe(false);
  await act(async () => reads[1]!.resolve(true));
  expect(latest).toBe(true);
});

it('rejects late project identity results even when the region identity is reused', async () => {
  const { project, region } = fixture();
  await act(async () => root!.render(<Harness project={project} region={region} />));
  const other = { ...project, id: 'other-project' };
  await act(async () => root!.render(<Harness project={other} region={region} />));
  await act(async () => reads[0]!.resolve(true));
  expect(latest).toBe(false);
  expect(available.mock.calls[1]?.[0]).toBe(other);
  await act(async () => reads[1]!.resolve(false));
  expect(latest).toBe(false);
});

it('aborts and clears on unmount without starting a queued read after late settlement', async () => {
  const { project, region } = fixture();
  await act(async () => root!.render(<Harness project={project} region={region} />));
  await act(async () =>
    root!.render(<Harness project={project} region={{ ...region, id: 'queued' }} />)
  );
  act(() => root!.unmount());
  root = null;
  expect(available.mock.calls[0]?.[2]?.aborted).toBe(true);
  expect(clear).toHaveBeenCalledOnce();
  await act(async () => reads[0]!.resolve(true));
  expect(available).toHaveBeenCalledOnce();
});

it('does not publish the StrictMode cleanup generation after remount', async () => {
  const props = fixture();
  await act(async () =>
    root!.render(
      <StrictMode>
        <Harness {...props} />
      </StrictMode>
    )
  );
  expect(available).toHaveBeenCalledOnce();
  expect(available.mock.calls[0]?.[2]?.aborted).toBe(true);
  expect(clear).toHaveBeenCalledOnce();
  await act(async () => reads[0]!.resolve(true));
  expect(latest).toBe(false);
  expect(available).toHaveBeenCalledTimes(2);
  await act(async () => reads[1]!.resolve(true));
  expect(latest).toBe(true);
});

it('leaves refusal unavailable and recovers for the next requested region', async () => {
  const { project, region } = fixture(),
    before = JSON.stringify(project);
  await act(async () => root!.render(<Harness project={project} region={region} />));
  await act(async () => reads[0]!.reject(new Error('integrity refusal')));
  expect(latest).toBe(false);
  expect(JSON.stringify(project)).toBe(before);
  await act(async () =>
    root!.render(<Harness project={project} region={{ ...region, id: 'retry' }} />)
  );
  await act(async () => reads[1]!.resolve(true));
  expect(latest).toBe(true);
  expect(JSON.stringify(project)).toBe(before);
});
