import { DEFAULT_WINDOW_HEADER } from '../../../../apps/extension/src/features/browser-frame/header';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ReviewStage } from '../../../../apps/extension/src/gallery/video-review/stage';
import { evaluateQuickEditCameraAtTime } from '../../../../apps/extension/src/features/video/review/advanced/scene';

function createSurface() {
  const stylesheet = document.createElement('style');
  stylesheet.textContent =
    '.relative{position:relative}.absolute{position:absolute}.flex-1{flex:1}.overflow' +
    '-hidden{overflow:hidden}.inset-0{inset:0}.bg-black{background:black}';
  document.head.append(stylesheet);
  const host = document.createElement('div');
  host.style.cssText =
    'display:flex;width:calc(100vw - 157px);height:calc(100vh - 129px);position:relative';
  document.body.append(host);
  const root = createRoot(host);
  const video = { current: null as HTMLVideoElement | null };
  return { host, root, video };
}
let surface: ReturnType<typeof createSurface> | undefined;
const source = { width: 320, height: 180, duration: 12, size: 1, mimeType: 'video/webm' };
const regions = [
  {
    id: 'a',
    start: 0,
    end: 1,
    linkTo: 'b',
    linkEasing: 'linear' as const,
    transform: { scale: 1.25, centerX: 0.5, centerY: 0.5 },
    enter: { type: 'none' as const, duration: 0 },
    exit: { type: 'none' as const, duration: 0 },
  },
  {
    id: 'b',
    start: 11,
    end: 12,
    transform: { scale: 1.05, centerX: 0.5, centerY: 0.5 },
    enter: { type: 'none' as const, duration: 0 },
    exit: { type: 'none' as const, duration: 0 },
  },
];
export async function show(url: string, time: number, follows: boolean, padding = 40) {
  const { host, root, video } = (surface ??= createSurface());
  flushSync(() =>
    root.render(
      <ReviewStage
        url={url}
        source={source}
        video={video}
        drawing={false}
        region={undefined}
        scene={{
          windowHeader: {
            ...DEFAULT_WINDOW_HEADER,
            kind: 'browser' as const,
            title: 'Alignment',
            url: 'https://example.test',
          },
          background: {
            enabled: true,
            type: 'solid',
            color: '#ff00ffff',
            zoomBehavior: follows ? 'follow-video' : 'fixed',
            layout: { padding, cornerRadius: 0 },
          },
          camera: evaluateQuickEditCameraAtTime(regions, time),
        }}
        onRegion={() => {}}
        onReady={() => {}}
        onTime={() => {}}
        onPlaying={() => {}}
        onError={() => {}}
      />
    )
  );
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  );
  const image = host.querySelector('img');
  return {
    video: video.current?.getBoundingClientRect().toJSON(),
    header: image?.getBoundingClientRect().toJSON(),
    headerWidth: image?.style.width,
    clip: video.current?.parentElement?.getBoundingClientRect().toJSON(),
  };
}

export async function motion(url: string, follows: boolean) {
  const frames = [];
  for (let frame = 0; frame < 30; frame++) {
    const boxes = await show(url, 4 + frame / 60, follows);
    frames.push(boxes);
  }
  return frames;
}

export async function labelMetrics() {
  const { composeWindowHeaderSvg } =
    await import('../../../../apps/extension/src/features/browser-frame/appearance');
  const rows = [];
  for (const style of ['windows', 'macos', 'linux'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      const image = new Image();
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(composeWindowHeaderSvg({ ...DEFAULT_WINDOW_HEADER, style, theme, title: 'HЖ' }, { width: 1600, height: 900 }))}`;
      await image.decode();

      const canvas = document.createElement('canvas');
      canvas.width = 6400;
      canvas.style.width = '1600px';
      canvas.height = 344;
      canvas.style.height = '86px';
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0, 6400, 344);
      const x = style === 'macos' ? 126 : 78;
      let top = 35,
        bottom = 0;
      let weightedY = 0,
        ink = 0;
      const started = performance.now();
      do {
        context.drawImage(image, 0, 0, 6400, 344);
        const pixels = context.getImageData(x * 4, 36, 140, 92).data;
        weightedY = 0;
        ink = 0;
        for (let y = 0; y < 92; y++)
          for (let col = 0; col < 140; col++) {
            const value = pixels[(y * 140 + col) * 4]!;
            const weight = Math.max(0, theme === 'light' ? 255 - value : value - 53);
            weightedY += ((y + 36.5) / 4) * weight;
            ink += weight;
            if (theme === 'light' ? value < 128 : value > 150) {
              top = Math.min(top, (y + 36) / 4);
              bottom = Math.max(bottom, (y + 36) / 4);
            }
          }
        if (bottom === 0) await new Promise(requestAnimationFrame);
      } while (bottom === 0 && performance.now() - started < 3000);
      rows.push({ style, theme, top, bottom, center: weightedY / ink });
      document.body.append(canvas);
    }
  }
  return rows;
}
