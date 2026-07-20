import type { Textbox } from 'fabric';
import { normalizeTextLayoutMode } from '../mode';
import { applyTextLayout } from './apply';
import type { LayoutTextbox } from './types';

export function attachTextLayoutLifecycle(textbox: Textbox): void {
  const layoutTextbox = textbox as LayoutTextbox & {
    sniptaleTextLayoutLifecycleAttached?: boolean;
  };
  if (layoutTextbox.sniptaleTextLayoutLifecycleAttached || typeof layoutTextbox.on !== 'function') {
    return;
  }

  const syncAutoLayout = () => {
    if (normalizeTextLayoutMode(textbox.sniptaleTextLayoutMode) !== 'auto') {
      return;
    }

    applyTextLayout(textbox, { layoutMode: 'auto' });
    textbox.setCoords();
    textbox.canvas?.requestRenderAll();
  };

  layoutTextbox.on('changed', syncAutoLayout);
  layoutTextbox.on('editing:entered', syncAutoLayout);
  layoutTextbox.on('editing:exited', syncAutoLayout);
  layoutTextbox.sniptaleTextLayoutLifecycleAttached = true;
}
