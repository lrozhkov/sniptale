import { windowHeaderGeometry } from '@sniptale/runtime-contracts/window-header';

/** Window geometry never changes authored source dimensions or normalized target coordinates. */
export function resolveTourImageFrame(slide, viewport) {
  const stage = { x: 0, y: 0, width: viewport.stageWidth, height: viewport.stageHeight };
  const header = viewport.windowHeader;
  if (!header || !slide.image) return { window: stage, content: stage, header: null };
  const height = Math.min(stage.height, windowHeaderGeometry(header, stage).height);
  return {
    window: stage,
    header: { x: 0, y: 0, width: stage.width, height },
    content: { x: 0, y: height, width: stage.width, height: stage.height - height },
  };
}
