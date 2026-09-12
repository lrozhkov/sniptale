import { expect, it } from 'vitest';
import {
  createGuideProject,
  createGuideStep,
  createGuideImageBlock,
} from '../../features/scenario/project/public';
import {
  changeHtmlImageSettings,
  DEFAULT_HTML_IMAGES,
  htmlImageRasterKey,
  resolveHtmlImageSettings,
} from './html-image-settings';
it('preserves independent overrides, bulk edits only selected occurrences and restores inheritance', () => {
  const p = createGuideProject('Guide');
  const step = createGuideStep('Step');
  const image = createGuideImageBlock({
    id: 'a',
    assetId: 'asset',
    width: 400,
    height: 200,
    source: { kind: 'import', filename: 'image.png' },
  });
  step.blocks = [image, { ...image, id: 'b' }];
  p.items = [step];
  const next = changeHtmlImageSettings(p, new Set(['a']), { content: 'frame', viewer: false });
  const a = next.items[0]?.kind === 'step' ? next.items[0].blocks[0] : null;
  if (a?.kind !== 'image') throw new Error('Missing image');
  expect(resolveHtmlImageSettings(next, a)).toEqual({
    ...DEFAULT_HTML_IMAGES,
    content: 'frame',
    viewer: false,
  });
  expect(a.frame).toBe(image.frame);
  expect(a.assetId).toBe(image.assetId);
  const changed = { ...next, htmlExport: { ...DEFAULT_HTML_IMAGES, optimize: true } };
  expect(resolveHtmlImageSettings(changed, a).optimize).toBe(false);
  expect(resolveHtmlImageSettings(changed, image).optimize).toBe(true);
  const reset = changeHtmlImageSettings(changed, new Set(['a']), null);
  expect(reset.items).toEqual(p.items);
  expect(htmlImageRasterKey(image, DEFAULT_HTML_IMAGES)).toBe(
    htmlImageRasterKey({ ...image, id: 'b' }, { ...DEFAULT_HTML_IMAGES, viewer: false })
  );
  expect(htmlImageRasterKey(a, resolveHtmlImageSettings(next, a))).not.toBe(
    htmlImageRasterKey(image, DEFAULT_HTML_IMAGES)
  );
});
