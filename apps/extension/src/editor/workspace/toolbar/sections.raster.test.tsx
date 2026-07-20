import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { translate } from '../../../platform/i18n';
import { EditorToolbarRasterSection } from './sections';

describe('toolbar/sections raster tools', () => {
  it('renders the dedicated raster tool group and dispatches activation', () => {
    const onActivateTool = vi.fn();

    const markup = renderToStaticMarkup(
      <EditorToolbarRasterSection
        hasImage
        isToolButtonActive={() => false}
        onActivateTool={onActivateTool}
      />
    );

    expect(markup).toContain(translate('editor.tools.selection'));
    expect(markup).toContain(translate('editor.tools.brush'));
    expect(markup).toContain(translate('editor.tools.eraser'));
    expect(markup).toContain(translate('editor.tools.fill'));
    expect(onActivateTool).not.toHaveBeenCalled();
  });
});
