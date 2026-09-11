// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VideoOutputCodec } from '@sniptale/runtime-contracts/video/types/types';
const { canEncodeVideo } = vi.hoisted(() => ({ canEncodeVideo: vi.fn() }));
vi.mock('mediabunny', () => ({ canEncodeVideo }));
import { useProfileCodecSupport } from './profile-support';
let root: Root;
let container: HTMLDivElement;
function Probe({ codec }: { codec: VideoOutputCodec }) {
  return <span>{useProfileCodecSupport(codec)}</span>;
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it.each([true, false])('reports codec availability %s', async (supported) => {
  canEncodeVideo.mockResolvedValue(supported);
  await act(async () => root.render(<Probe codec={VideoOutputCodec.VP9} />));
  expect(container.textContent).toBe(supported ? 'available' : 'unavailable');
  expect(canEncodeVideo).toHaveBeenCalledWith('vp9');
});
it('keeps unknown distinct from unsupported after a failed probe', async () => {
  canEncodeVideo.mockRejectedValue(new Error('Probe unavailable'));
  await act(async () => root.render(<Probe codec={VideoOutputCodec.AVC} />));
  expect(container.textContent).toBe('unknown');
});
it('ignores a late result for the previously selected codec', async () => {
  let resolveOld!: (value: boolean) => void;
  canEncodeVideo
    .mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        resolveOld = resolve;
      })
    )
    .mockResolvedValueOnce(true);
  await act(async () => root.render(<Probe codec={VideoOutputCodec.VP9} />));
  expect(container.textContent).toBe('checking');
  await act(async () => root.render(<Probe codec={VideoOutputCodec.AVC} />));
  expect(container.textContent).toBe('available');
  await act(async () => resolveOld(false));
  expect(container.textContent).toBe('available');
});
