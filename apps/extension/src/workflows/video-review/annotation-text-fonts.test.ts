import { afterEach, expect, it, vi } from 'vitest';
import { createReviewAnnotationTextClip } from '../../features/video/review/annotation-effects/text-animation';
import {
  applyReviewTextTemplate,
  reviewBuiltinTextTemplates,
} from '../../features/video/review/annotation-effects/text-templates';
import {
  prepareReviewAnnotationTextFonts,
  reviewAnnotationTextFont,
} from './annotation-text-fonts';

afterEach(() => vi.unstubAllGlobals());

function clip() {
  return applyReviewTextTemplate(
    createReviewAnnotationTextClip('test', 'Новый кадр', 0, 1, 0),
    reviewBuiltinTextTemplates.clean
  );
}

it('waits for the requested weight once per document before selecting a local font', async () => {
  const face = Promise.withResolvers<{ status: string }[]>();
  const load = vi.fn(() => face.promise);
  vi.stubGlobal('document', { fonts: { load } });
  const title = clip();
  const signal = new AbortController().signal;
  const first = prepareReviewAnnotationTextFonts([title], signal);
  const second = prepareReviewAnnotationTextFonts([title], signal);
  expect(reviewAnnotationTextFont(title.appearance!, 20)).toBe('600 20px Arial, sans-serif');
  face.resolve([{ status: 'loaded' }]);
  await Promise.all([first, second]);
  expect(load).toHaveBeenCalledExactlyOnceWith(
    '600 32px "Sniptale Text", Arial, sans-serif',
    'AaЯя'
  );
  expect(reviewAnnotationTextFont(title.appearance!, 20)).toBe(
    '600 20px "Sniptale Text", Arial, sans-serif'
  );
});

it('keeps the same fallback after a local font failure and for later consumers of that weight', async () => {
  const load = vi.fn().mockRejectedValue(new Error('Missing local font'));
  vi.stubGlobal('document', { fonts: { load } });
  const title = clip();
  const signal = new AbortController().signal;
  await prepareReviewAnnotationTextFonts([title], signal);
  expect(reviewAnnotationTextFont(title.appearance!, 24)).toBe('600 24px Arial, sans-serif');
  await prepareReviewAnnotationTextFonts([title], signal);
  expect(load).toHaveBeenCalledTimes(1);
  expect(reviewAnnotationTextFont(title.appearance!, 24)).toBe('600 24px Arial, sans-serif');
});
