import type { Textbox } from 'fabric';

import { normalizeShadowPreset } from '../../../shadow';
import { attachTextCalloutAlignment } from '../alignment';
import { createPlainTextCalloutShadow } from '../callout-shadow';
import { attachTextCalloutEditingLifecycle } from '../editing';
import {
  DEFAULT_TEXT_CALLOUT_HEIGHT,
  DEFAULT_TEXT_CALLOUT_WIDTH,
  getTextCalloutSurfaceSize,
  normalizeCalloutDimension,
} from '../geometry';
import { attachTextCalloutGeometry } from '../interaction';
import { applyTextLayout, attachTextLayoutLifecycle } from '../layout';
import { normalizeTextLayoutMode } from '../mode';
import { getTextCalloutPadding, resolveTextCalloutFormat } from './format';
import { renderTextCalloutBackground } from './rendering';

type TextboxWithCalloutRenderer = Textbox & {
  _renderBackground: (ctx: CanvasRenderingContext2D) => void;
  sniptaleTextCalloutRendererAttached?: boolean;
};

export function applyTextCalloutRendering(textbox: Textbox): void {
  const renderable = textbox as TextboxWithCalloutRenderer;
  const format = resolveTextCalloutFormat(textbox);
  textbox.sniptaleTextCalloutFormat = format;
  textbox.sniptaleTextLayoutMode = normalizeTextLayoutMode(textbox.sniptaleTextLayoutMode);
  textbox.sniptaleTextCalloutShadow = normalizeShadowPreset(textbox.sniptaleTextCalloutShadow);
  textbox.sniptaleTextCalloutWidth =
    normalizeCalloutDimension(textbox.sniptaleTextCalloutWidth) ?? DEFAULT_TEXT_CALLOUT_WIDTH;
  textbox.sniptaleTextCalloutHeight =
    normalizeCalloutDimension(textbox.sniptaleTextCalloutHeight) ?? DEFAULT_TEXT_CALLOUT_HEIGHT;

  if (format !== 'plain') {
    const surface = getTextCalloutSurfaceSize(textbox, format);
    textbox.sniptaleTextCalloutWidth = surface.width;
    textbox.sniptaleTextCalloutHeight = surface.height;
  }

  textbox.set({
    padding: getTextCalloutPadding(format),
    objectCaching: false,
    shadow: createPlainTextCalloutShadow(textbox, format),
  });
  attachTextCalloutAlignment(textbox);
  attachTextCalloutEditingLifecycle(textbox);
  attachTextCalloutGeometry(textbox);
  attachTextLayoutLifecycle(textbox);
  applyTextLayout(textbox);

  if (renderable.sniptaleTextCalloutRendererAttached) {
    return;
  }

  renderable._renderBackground = function renderTextCallout(ctx: CanvasRenderingContext2D) {
    renderTextCalloutBackground(this, ctx);
  };
  renderable.sniptaleTextCalloutRendererAttached = true;
}
