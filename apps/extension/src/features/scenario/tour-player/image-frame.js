import { windowHeaderGeometry } from '@sniptale/runtime-contracts/window-header';

/** Fit the decorated source as one window; authored bitmap coordinates remain unchanged. */
export function resolveTourImageFrame(slide, viewport) {
  const stage = { x: 0, y: 0, width: viewport.stageWidth, height: viewport.stageHeight };
  const header = viewport.windowHeader;
  if (!header || !slide.image) return { window: stage, content: stage, header: null };
  const source = slide.image;
  const headerHeight = windowHeaderGeometry(header, source).height;
  const scale = (slide.fit === 'cover' ? Math.max : Math.min)(
    stage.width / source.width,
    stage.height / (source.height + headerHeight)
  );
  const width = source.width * scale;
  const height = (source.height + headerHeight) * scale;
  const x = (stage.width - width) / 2;
  const y = (stage.height - height) / 2;
  const decoration = headerHeight * scale;
  return {
    window: { x, y, width, height },
    header: { x, y, width, height: decoration },
    content: { x, y: y + decoration, width, height: source.height * scale },
  };
}
