// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewBorderOverlay } from './border-overlay';
import { drawSceneBorders } from '../../features/video/composition/draw/border';

vi.mock('../../features/video/composition/draw/border', () => ({ drawSceneBorders: vi.fn() }));
const output = { width: 200, height: 100 };
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    clearRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('paints identical border inputs once but repaints after geometry changes or remount', () => {
  const frame = {
    id: 'b',
    path: 'M0 0H100V50Z',
    perimeter: 300,
    width: 2,
    color: '#ffffff',
    style: 'solid' as const,
    start: 0,
    end: 1,
    opacity: 1,
  };
  vi.mocked(drawSceneBorders).mockClear();
  const renderBorder = (frames: (typeof frame)[]) =>
    act(() => root.render(<ReviewBorderOverlay output={{ ...output }} frames={frames} />));
  renderBorder([frame]);
  renderBorder([{ ...frame }]);
  expect(drawSceneBorders).toHaveBeenCalledOnce();
  renderBorder([{ ...frame, width: 3 }]);
  expect(drawSceneBorders).toHaveBeenCalledTimes(2);
  renderBorder([]);
  renderBorder([{ ...frame, width: 3 }]);
  expect(drawSceneBorders).toHaveBeenCalledTimes(3);
});
