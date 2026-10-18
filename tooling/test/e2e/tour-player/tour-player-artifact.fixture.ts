import type { TourDocument } from '@sniptale/runtime-contracts/scenario/types/tour';
import type { TourPlayerLabels } from '../../../../apps/extension/src/features/scenario/tour-player/document';
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = fileURLToPath(new URL('../../../..', import.meta.url));
const playerDir = path.join(repo, 'apps/extension/src/features/scenario/tour-player');
const proofDir = path.join(repo, '.tmp/tour-player-proof');

export const labels = {
  expand: 'Expand explanation',
  collapse: 'Collapse explanation',
  previous: 'Back',
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
  seek: 'Playback position',
  retry: 'Retry',
  loading: 'Loading',
  mediaError: 'Image failed',
  choose: 'Choose a destination',
  showHints: 'Show hints',
  hideHints: 'Hide hints',
};

const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=';

export function slide(id: string, title: string) {
  return {
    kind: 'image' as const,
    id,
    title,
    image: {
      assetId: 'image',
      galleryAssetId: null,
      editDocumentId: null,
      width: 640,
      height: 360,
      alt: 'Screenshot',
      source: { kind: 'import' as const, filename: 'capture.png' },
    },
    origin: null,
    fit: 'contain' as const,
    camera: { mode: 'inherit' as const, center: { x: 0.5, y: 0.5 }, zoom: 1 },
    masks: [],
    narration: null,
    timing: {
      mode: 'inherit' as const,
      holdSeconds: 4,
      truncateNarration: false,
    },
    actions: [
      {
        type: 'hotspot' as const,
        object: {
          id: `point-${id}`,
          point: { x: 0.5, y: 0.5 },
          targetRect: null,
          label: 'What happened here',
          text: 'This step ran the capture and stored the result.',
          appearance: null,
          visual: { kind: 'point' as const, pulse: true },
        },
      },
    ],
  };
}

export const tour = {
  version: 2 as const,
  id: 'visual-tour',
  stage: { aspect: '16:9' as const, background: '#111827' },
  style: {
    accent: '#f97316',
    text: '#ffffff',
    surface: '#1f2937',
    textAppearance: {
      presentation: 'caption-bottom' as const,
      alignment: 'start' as const,
      placement: 'auto' as const,
    },
  },
  playback: { autoplay: false, loop: false, minimumHoldSeconds: 4, autoZoom: true },
  transition: { kind: 'none' as const, durationMs: 0, hotspotTravelMs: 0 },
  slides: [slide('first', 'First step'), slide('second', 'Second step')],
  endScreen: { enabled: true, title: 'Done', description: '', button: null, restart: true },
};

/** Bundles the real document module the same way the vite plugin does, then builds the artifact. */
export async function buildPlayerHtml(
  documentTour: TourDocument = tour,
  playerLabels: TourPlayerLabels = labels,
  extraAssets: { id: string; mime: string; base64: string }[] = []
): Promise<string> {
  const script = (
    await build({
      absWorkingDir: repo,
      entryPoints: [path.join(playerDir, 'runtime.js')],
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'browser',
      target: 'es2022',
      legalComments: 'none',
    })
  ).outputFiles[0]!.text;
  const bundled = await build({
    absWorkingDir: repo,
    entryPoints: [path.join(playerDir, 'document.ts')],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    plugins: [
      {
        name: 'tour-player-inline',
        setup(plugin) {
          plugin.onResolve({ filter: /\?tour-player-script$/ }, () => ({
            path: 'tour-script',
            namespace: 'tour-inline',
          }));
          plugin.onResolve({ filter: /\?raw$/ }, async (args) => {
            const resolved = await plugin.resolve(args.path.slice(0, -4), {
              resolveDir: args.resolveDir,
              kind: 'import-statement',
            });
            return resolved.errors.length
              ? { errors: resolved.errors }
              : { path: resolved.path, namespace: 'tour-raw' };
          });
          plugin.onLoad({ filter: /.*/, namespace: 'tour-raw' }, async (args) => ({
            contents: `export default ${JSON.stringify(await readFile(args.path, 'utf8'))}`,
            loader: 'js',
          }));
          plugin.onResolve(
            { filter: /(?:\.woff2|@sniptale\/ui\/styles\/(?:interface|document)-font)\?inline$/ },
            async (args) => {
              const resolved = await plugin.resolve(args.path.slice(0, -7), {
                resolveDir: args.resolveDir,
                kind: 'import-statement',
              });
              return resolved.errors.length
                ? { errors: resolved.errors }
                : { path: resolved.path, namespace: 'tour-font' };
            }
          );
          plugin.onLoad({ filter: /.*/, namespace: 'tour-font' }, async (args) => ({
            contents: await readFile(args.path),
            loader: 'dataurl',
          }));
          plugin.onLoad({ filter: /.*/, namespace: 'tour-inline' }, () => ({
            contents: `export default ${JSON.stringify(script)}`,
            loader: 'js',
          }));
        },
      },
    ],
  });
  await mkdir(proofDir, { recursive: true });
  const bundlePath = path.join(proofDir, 'document-bundle.mjs');
  await writeFile(bundlePath, bundled.outputFiles[0]!.text);
  const module = (await import(pathToFileURL(bundlePath).href)) as {
    buildTourPlayerHtml(args: {
      tour: unknown;
      title: string;
      labels: unknown;
      assets: { id: string; mime: string; base64: string }[];
    }): Promise<string>;
  };
  return module.buildTourPlayerHtml({
    tour: documentTour,
    title: 'Demo tour',
    labels: playerLabels,
    assets: [{ id: 'image', mime: 'image/png', base64: png }, ...extraAssets],
  });
}
