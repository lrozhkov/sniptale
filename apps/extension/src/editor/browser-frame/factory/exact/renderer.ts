import type { BrowserFrameState } from '../../../../features/editor/document/types';
import { composeExactBrowserFrameSvg } from './compositor';

interface ExactBrowserFrameRenderOptions {
  browserFrame: BrowserFrameState;
  height: number;
  headerHeight: number;
  radius: number;
  width: number;
}

function createSvgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export async function renderExactBrowserFrameToDataUrl(
  options: ExactBrowserFrameRenderOptions
): Promise<string> {
  return createSvgDataUrl(
    composeExactBrowserFrameSvg({
      contentHeight: Math.max(0, options.height - options.headerHeight),
      faviconDataUrl: options.browserFrame.faviconDataUrl ?? null,
      headerHeight: options.headerHeight,
      height: options.height,
      radius: options.radius,
      title: options.browserFrame.title,
      url: options.browserFrame.url,
      width: options.width,
    })
  );
}
