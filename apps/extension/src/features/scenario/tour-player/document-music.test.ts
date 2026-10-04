import { expect, it } from 'vitest';
import { createTourDocument, createTourImageSlide } from '../project/factories';
import { buildTourPlayerHtml, buildTourPlayerBlob } from './document';
const labels = {
  expand: 'Expand',
  collapse: 'Collapse',
  previous: 'Previous',
  next: 'Next',
  contents: 'Contents',
  close: 'Close',
  restart: 'Restart',
  finished: 'Finished',
  empty: 'Empty',
  point: 'Point',
  details: 'Details',
  play: 'Play',
  pause: 'Pause',
  seek: 'Seek',
  retry: 'Retry',
  loading: 'Loading',
  mediaError: 'Media failed',
  choose: 'Choose',
};

function fixture() {
  const tour = createTourDocument();
  const slide = createTourImageSlide('first');
  slide.narration = {
    assetId: 'music',
    duration: 4,
    trimStart: 0,
    trimEnd: 4,
    gain: 1,
    transcript: '',
  };
  tour.slides = [slide];
  tour.backgroundMusic = {
    assetId: 'music',
    duration: 4,
    volume: 0.3,
    loop: true,
    ducking: { enabled: true, level: 0.25 },
  };
  tour.audioResources = [{ assetId: 'unused', duration: 1, name: 'Private unused' }];
  return { tour, title: 'Music', labels };
}
function payload(html: string) {
  const json = html.match(/<script id="tour-data" type="application\/json">(.*?)<\/script>/s)?.[1];
  if (!json) throw new Error('Missing payload');
  return JSON.parse(json);
}
it('embeds only bound music once and produces identical standalone HTML and Blob bytes', async () => {
  const args = fixture();
  const assets = [
    { id: 'music', mime: 'audio/wav', base64: 'bXVzaWM=' },
    { id: 'unused', mime: 'audio/wav', base64: 'dW51c2Vk' },
  ];
  const html = await buildTourPlayerHtml({ ...args, assets });
  const blob = await buildTourPlayerBlob({
    ...args,
    signal: new AbortController().signal,
    assets: assets.map((asset) => ({
      id: asset.id,
      mime: asset.mime,
      blob: new Blob([asset.id], { type: asset.mime }),
    })),
  });
  expect(await blob.text()).toBe(html);
  const data = payload(html);
  expect(data.assets).toEqual([{ id: 'music', src: 'data:audio/wav;base64,bXVzaWM=' }]);
  expect(data.tour.backgroundMusic).toEqual(args.tour.backgroundMusic);
  expect(data.tour.audioResources).toBeUndefined();
  args.tour.slides[0]!.narration = null;
  expect(payload(await buildTourPlayerHtml({ ...args, assets })).assets).toEqual(data.assets);
});
it('rejects missing, duplicate, wrong-MIME and image-conflicting music', async () => {
  const args = fixture();
  args.tour.slides[0]!.narration = null;
  for (const assets of [
    [],
    [{ id: 'music', mime: 'image/png', base64: 'AA==' }],
    [
      { id: 'music', mime: 'audio/wav', base64: 'AA==' },
      { id: 'music', mime: 'audio/wav', base64: 'AA==' },
    ],
  ])
    await expect(buildTourPlayerHtml({ ...args, assets })).rejects.toThrow();
  args.tour.stage.image = {
    assetId: 'music',
    width: 1,
    height: 1,
    alt: '',
    galleryAssetId: null,
    editDocumentId: null,
    source: { kind: 'import', filename: 'x' },
  };
  await expect(
    buildTourPlayerHtml({ ...args, assets: [{ id: 'music', mime: 'audio/wav', base64: 'AA==' }] })
  ).rejects.toThrow();
});
it('does not embed detached music and rejects empty bytes or aborted encoding', async () => {
  const args = fixture();
  args.tour.slides[0]!.narration = null;
  const assets = [{ id: 'music', mime: 'audio/wav', blob: new Blob([], { type: 'audio/wav' }) }];
  await expect(
    buildTourPlayerBlob({ ...args, assets, signal: new AbortController().signal })
  ).rejects.toThrow();
  const controller = new AbortController();
  controller.abort();
  await expect(
    buildTourPlayerBlob({ ...args, assets, signal: controller.signal })
  ).rejects.toThrow();
  args.tour.backgroundMusic = null;
  expect(
    payload(
      await buildTourPlayerHtml({
        ...args,
        assets: [{ id: 'music', mime: 'audio/wav', base64: 'AA==' }],
      })
    ).assets
  ).toEqual([]);
});
