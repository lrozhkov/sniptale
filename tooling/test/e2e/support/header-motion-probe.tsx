import { DEFAULT_WINDOW_HEADER } from '../../../../apps/extension/src/features/browser-frame/header';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ReviewStage } from '../../../../apps/extension/src/gallery/video-review/stage';
import { evaluateQuickEditCameraAtTime } from '../../../../apps/extension/src/features/video/review/advanced/scene';

function createSurface() {
  const stylesheet = document.createElement('style');
  stylesheet.textContent =
    '.relative{position:relative}.absolute{position:absolute}.flex-1{flex:1}.overflow-hidden{overflow:hidden}.inset-0{inset:0}.bg-black{background:black}';
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
export async function show(url: string, time: number, follows: boolean) {
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
            layout: { padding: 40, cornerRadius: 0 },
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
