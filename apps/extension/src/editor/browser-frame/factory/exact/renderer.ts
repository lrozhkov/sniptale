import type { BrowserFrameState } from '../../../../features/editor/document/types';
import { composeWindowHeaderSvg } from '../../../../features/browser-frame/appearance';
import { resolveEditorWindowHeader } from '../../../../features/editor/document/constants';

interface ExactBrowserFrameRenderOptions {
  browserFrame: BrowserFrameState;
  height: number;
  sourceHeight: number;
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
    composeWindowHeaderSvg(resolveEditorWindowHeader(options.browserFrame), {
      width: options.width,
      height: options.sourceHeight,
    })
  );
}
