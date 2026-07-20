import type { Canvas, FabricObject } from 'fabric';
import type { BrowserFrameState } from '../../../features/editor/document/types';
import { useEditorStore } from '../../state/useEditorStore';
import {
  createBrowserFrameRebuildDonePayload,
  createBrowserFrameRebuildPayload,
} from '../document/lifecycle-helpers';

import type { SourceState } from '../../document/model/source-state';
import { findBrowserFrameHeader } from '../tools/decorations';
import { logEditorBrowserFrame } from './document-log';
import { prepareBrowserFrameLayerReplacement, replaceBrowserFrameLayer } from './document-layer';
import { readCurrentBrowserFrameSourceState } from './source-state';

function isCurrentRenderToken(
  renderToken: number,
  isBrowserFrameRenderTokenCurrent?: (token: number) => boolean
) {
  return (isBrowserFrameRenderTokenCurrent ?? ((token) => token === renderToken))(renderToken);
}

async function rebuildExistingBrowserFrameLayer(args: {
  canvas: Canvas;
  header: FabricObject;
  browserFrame: BrowserFrameState;
  source: SourceState | null | undefined;
  renderToken: number;
  isBrowserFrameRenderTokenCurrent?: (token: number) => boolean;
  ensureBrowserFrameOnTop: () => void;
}): Promise<void> {
  const nextSource = readCurrentBrowserFrameSourceState(args.canvas, args.source);
  if (!nextSource) {
    return;
  }

  const nextHeader = await prepareBrowserFrameLayerReplacement({
    browserFrame: args.browserFrame,
    header: args.header,
    nextSource,
  });
  if (!isCurrentRenderToken(args.renderToken, args.isBrowserFrameRenderTokenCurrent)) {
    return;
  }

  replaceBrowserFrameLayer(args.canvas, args.header, nextHeader);
  args.ensureBrowserFrameOnTop();
  args.canvas.requestRenderAll();
  logEditorBrowserFrame(
    'rebuild:done',
    createBrowserFrameRebuildDonePayload({
      frameObjectsCount: 0,
      header: nextHeader,
      renderToken: args.renderToken,
    })
  );
}

export async function rebuildEditorControllerFrameDecorations(options: {
  canvas: Canvas | null;
  canvasDocumentSize: { width: number; height: number };
  source?: SourceState | null;
  browserFrameRenderToken: number;
  setBrowserFrameRenderToken: (token: number) => void;
  isBrowserFrameRenderTokenCurrent?: (token: number) => boolean;
  ensureBrowserFrameOnTop: () => void;
}): Promise<void> {
  const {
    browserFrameRenderToken,
    canvas,
    canvasDocumentSize,
    ensureBrowserFrameOnTop,
    isBrowserFrameRenderTokenCurrent,
    setBrowserFrameRenderToken,
    source,
  } = options;
  if (!canvas) {
    return;
  }

  const header = findBrowserFrameHeader(canvas);
  const browserEnabled = header !== undefined;
  const renderToken = browserFrameRenderToken + 1;
  setBrowserFrameRenderToken(renderToken);
  logEditorBrowserFrame(
    'rebuild:start',
    createBrowserFrameRebuildPayload({
      browserEnabled,
      canvas,
      canvasDocumentSize,
      renderToken,
    })
  );

  if (!header) {
    return;
  }

  await rebuildExistingBrowserFrameLayer({
    browserFrame: useEditorStore.getState().browserFrame,
    canvas,
    ensureBrowserFrameOnTop,
    header,
    renderToken,
    source,
    ...(isBrowserFrameRenderTokenCurrent === undefined ? {} : { isBrowserFrameRenderTokenCurrent }),
  });
}
