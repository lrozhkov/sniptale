import { getTourNarrationTargets } from '../project/tour-resources';
import script from './runtime.js?tour-player-script';
import styles from './player.css?raw';
import { parseTourDocument } from '@sniptale/runtime-contracts/scenario/tour-parser';
import type { TourDocument, TourImage } from '@sniptale/runtime-contracts/scenario/types/tour';

export interface TourPlayerLabels {
  audioBlocked?: string;
  resize?: string;
  expand: string;
  collapse: string;
  previous: string;
  next: string;
  contents: string;
  close: string;
  restart: string;
  finished: string;
  empty: string;
  point: string;
  details: string;
  play: string;
  pause: string;
  seek: string;
  retry: string;
  loading: string;
  mediaError: string;
  choose: string;
}
export interface TourPlayerAsset {
  id: string;
  mime: string;
  base64: string;
}
const imageMimes = new Set(['image/png', 'image/jpeg', 'image/webp']);
const audioMimes = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
]);
function escape(value: string): string {
  return value.replace(
    /[&<>"']/gu,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!
  );
}
function imageProjection(image: TourImage | null) {
  if (!image) return null;
  return { assetId: image.assetId, width: image.width, height: image.height, alt: image.alt };
}

function selectAssets<T extends { id: string; mime: string }>(
  tour: TourDocument,
  inputAssets: readonly T[]
) {
  const required = new Map<string, 'image' | 'audio'>();
  for (const slide of tour.slides) {
    if (slide.kind === 'image' && slide.requiresTargetReview)
      throw new Error('Tour image targets require review before export.');
    const image = slide.kind === 'image' ? slide.image : slide.background.image;
    if (image) {
      if (required.get(image.assetId) === 'audio') throw new Error('Conflicting tour media roles.');
      required.set(image.assetId, 'image');
    }
    for (const target of getTourNarrationTargets(slide)) {
      if (!target.narration) continue;
      if (required.get(target.narration.assetId) === 'image')
        throw new Error('Conflicting tour media roles.');
      required.set(target.narration.assetId, 'audio');
    }
    if (slide.kind === 'image' && slide.masks.some((mask) => mask.kind === 'redact'))
      throw new Error('Tour redaction must be rasterized before export.');
  }
  const seen = new Set<string>();
  const assets = inputAssets.flatMap((asset) => {
    if (seen.has(asset.id)) throw new Error('Duplicate tour media.');
    seen.add(asset.id);
    const kind = required.get(asset.id);
    if (!kind) return [];
    if (!(kind === 'image' ? imageMimes : audioMimes).has(asset.mime))
      throw new Error('Invalid embedded tour media.');
    return [asset];
  });
  if ([...required.keys()].some((id) => !seen.has(id))) throw new Error('Missing tour media.');
  return assets;
}

/** Fixed executable source, inert authored JSON and embedded media form the exact preview/export artifact. */
async function buildTourPlayerShell(args: {
  tour: TourDocument;
  title: string;
  labels: TourPlayerLabels;
}): Promise<readonly [string, string]> {
  const parsed = parseTourDocument(args.tour);
  if (parsed.status !== 'ok') throw new Error('Invalid tour.');
  const tour = parsed.document;
  const { audioResources: _materials, ...viewerTour } = tour;
  const payload = {
    tour: {
      ...viewerTour,
      slides: tour.slides.map((slide) => {
        if (slide.kind === 'navigation')
          return {
            ...slide,
            background: { ...slide.background, image: imageProjection(slide.background.image) },
          };
        const { origin: _origin, ...rendering } = slide;
        return { ...rendering, image: imageProjection(slide.image) };
      }),
    },
    labels: args.labels,
  };
  const json = JSON.stringify(payload)
    .replace(/</gu, '\\u003c')
    .replace(/\u2028/gu, '\\u2028')
    .replace(/\u2029/gu, '\\u2029');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(script));
  const hash = btoa(String.fromCharCode(...new Uint8Array(digest)));
  const policy = `default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'; img-src data:; media-src data:; base-uri 'none'; form-action 'none'`;
  const labels = args.labels;
  return [
    `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${escape(policy)}">
<title>${escape(args.title)}</title>
<style>${styles}</style>
</head>
<body>
<main id="tour-player">
<header class="tour-toolbar">
<button class="tour-button tour-contents-trigger" data-tour-contents
 aria-haspopup="dialog" aria-expanded="false"
 aria-label="${escape(labels.contents)}" title="${escape(labels.contents)}">
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
</svg>
<span>${escape(labels.contents)}</span>
</button>
<span class="tour-title" data-tour-title aria-live="polite">
</span>
</header>
<div class="tour-viewport" data-tour-viewport>
<section class="tour-stage" data-tour-stage>
<div class="tour-scene" data-tour-scene>
</div>
</section>
<aside class="tour-hint" data-tour-hint hidden>
<div class="tour-hint-header">
<span data-tour-hint-point-count hidden></span>
<button class="tour-button tour-caption-title" data-tour-hint-toggle hidden aria-expanded="true">
<span data-tour-hint-title></span></button>
<button class="tour-button" data-tour-hint-close aria-label="${escape(labels.close)}">×</button>
</div>
<div class="tour-hint-text" data-tour-hint-text></div>
<div class="tour-hint-controls">
<button class="tour-button" data-tour-hint-previous aria-label="${escape(labels.previous)}">
${escape(labels.previous)}</button>
<span data-tour-hint-count hidden></span>
<button class="tour-button" data-tour-hint-next aria-label="${escape(labels.next)}">${escape(labels.next)}</button>
</div>
</aside>
</div>
<footer class="tour-transport">
<button class="tour-button tour-icon-button" data-tour-previous
 aria-label="${escape(labels.previous)}" title="${escape(labels.previous)}">
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
<path d="m15 18-6-6 6-6"/>
</svg>
</button>
<span class="tour-counter" data-tour-counter aria-live="polite">
</span>
<button class="tour-button tour-icon-button" data-tour-next
 aria-label="${escape(labels.next)}" title="${escape(labels.next)}">
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
<path d="m9 18 6-6-6-6"/>
</svg>
</button>
</footer>
<dialog class="tour-navigation" data-tour-navigation aria-label="${escape(labels.contents)}">
</dialog>
</main>
<script id="tour-data" type="application/json">${json.slice(0, -1)},"assets":[`,
    `]}</script>
<script>${script}</script>
</body>
</html>`,
  ] as const;
}

/** Small fixtures and existing consumers use the same shell and media validation. */
export async function buildTourPlayerHtml(args: {
  tour: TourDocument;
  title: string;
  labels: TourPlayerLabels;
  assets: readonly TourPlayerAsset[];
}): Promise<string> {
  const [start, end] = await buildTourPlayerShell(args);
  const assets = selectAssets(args.tour, args.assets).map((asset) => {
    if (!asset.base64 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(asset.base64))
      throw new Error('Invalid embedded tour media.');
    return { id: asset.id, src: `data:${asset.mime};base64,${asset.base64}` };
  });
  return start + JSON.stringify(assets).slice(1, -1).replace(/</gu, '\\u003c') + end;
}

/** Encodes bounded chunks once; preview and save retain the identical immutable Blob. */
export async function buildTourPlayerBlob(args: {
  tour: TourDocument;
  title: string;
  labels: TourPlayerLabels;
  assets: readonly { id: string; mime: string; blob: Blob }[];
  signal: AbortSignal;
}): Promise<Blob> {
  args.signal.throwIfAborted();
  const [start, end] = await buildTourPlayerShell(args);
  const parts: BlobPart[] = [start];
  let index = 0;
  for (const asset of selectAssets(args.tour, args.assets)) {
    if (!asset.blob.size) throw new Error('Empty tour media.');
    const id = JSON.stringify(asset.id).replace(/</gu, '\\u003c');
    parts.push(`${index++ ? ',' : ''}{"id":${id},"src":"data:${asset.mime};base64,`);
    for (let offset = 0; offset < asset.blob.size; offset += 96 * 1024) {
      args.signal.throwIfAborted();
      const bytes = new Uint8Array(
        await asset.blob.slice(offset, offset + 96 * 1024).arrayBuffer()
      );
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      parts.push(btoa(binary));
    }
    parts.push('"}');
  }
  args.signal.throwIfAborted();
  parts.push(end);
  return new Blob(parts, { type: 'text/html;charset=utf-8' });
}
