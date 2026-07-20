import type { Textbox } from 'fabric';
import { getTextCalloutContentRect, getTextCalloutSurfaceSize } from './geometry';
import { normalizeTextCalloutFormat } from './interaction';

type AlignedTextbox = Textbox & {
  _getLeftOffset: () => number;
  _getTopOffset: () => number;
  sniptaleTextCalloutAlignmentAttached?: boolean;
};

export function attachTextCalloutAlignment(textbox: Textbox): void {
  const alignedTextbox = textbox as AlignedTextbox;
  if (
    alignedTextbox.sniptaleTextCalloutAlignmentAttached ||
    typeof alignedTextbox._getLeftOffset !== 'function' ||
    typeof alignedTextbox._getTopOffset !== 'function'
  ) {
    return;
  }

  alignedTextbox._getLeftOffset = function getCalloutLeftOffset() {
    const format = normalizeTextCalloutFormat(this.sniptaleTextCalloutFormat);
    const surface = getTextCalloutSurfaceSize(this, format);
    const content = getTextCalloutContentRect(surface, this, format);

    return -surface.width / 2 + content.left;
  };

  alignedTextbox._getTopOffset = function getCalloutTopOffset() {
    const format = normalizeTextCalloutFormat(this.sniptaleTextCalloutFormat);
    const surface = getTextCalloutSurfaceSize(this, format);
    const content = getTextCalloutContentRect(surface, this, format);

    return -surface.height / 2 + content.top;
  };

  alignedTextbox.sniptaleTextCalloutAlignmentAttached = true;
}
