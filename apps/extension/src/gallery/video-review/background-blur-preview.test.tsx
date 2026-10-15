// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ReviewBackgroundBlurPreview } from './background-blur-preview';
import { drawReviewBackgroundPaint } from '../../workflows/video-review/scene-background';
vi.mock('../../workflows/video-review/scene-background', () => ({
  drawReviewBackgroundPaint: vi.fn(),
}));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('retains the decoded image during blur edits and cancels old URL loads', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const images: HTMLImageElement[] = [];
  vi.stubGlobal('Image', function () {
    const image = document.createElement('img');
    images.push(image);
    return image;
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    {} as CanvasRenderingContext2D
  );
  const host = document.createElement('div');
  const root = createRoot(host);
  const show = (imageUrl: string | undefined, blur: number) =>
    act(() =>
      root.render(
        <ReviewBackgroundBlurPreview
          background={{
            enabled: true,
            type: 'image',
            assetId: 'a',
            imageFit: 'cover',
            layout: { padding: 40, cornerRadius: 12, blur },
          }}
          imageUrl={imageUrl}
          width={4096}
          height={2160}
        />
      )
    );
  show('blob:first', 12);
  await act(async () => images[0]!.dispatchEvent(new Event('load')));
  show('blob:first', 20);
  expect(images).toHaveLength(1);
  expect(drawReviewBackgroundPaint).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({
      image: images[0],
      width: 2048,
      background: expect.objectContaining({ layout: expect.objectContaining({ blur: 10 }) }),
    })
  );
  show('blob:second', 20);
  expect(images[0]!.onload).toBeNull();
  expect(drawReviewBackgroundPaint).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({ image: null })
  );
  show(undefined, 0);
  expect(images[1]!.onload).toBeNull();
  await act(async () => root.unmount());
});
