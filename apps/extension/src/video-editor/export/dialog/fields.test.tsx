// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { getDefaultExportSettings } from '../../../features/video/project/timeline';
import { ExportDialogFields } from './fields';
import { translate } from '../../../platform/i18n';

it('groups picture settings together with exactly one frame-rate control', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    act(() =>
      root.render(
        <ExportDialogFields
          capabilities={null}
          onChange={vi.fn()}
          selectedClipAvailable={false}
          settings={getDefaultExportSettings(createEmptyVideoProject())}
          sourceDimensions={{ width: 1920, height: 1080 }}
        />
      )
    );
    const picture = [...container.querySelectorAll('section')].find((section) =>
      section.textContent?.includes(translate('videoEditor.exportDialog.pictureSection'))
    );
    expect(picture?.textContent).toContain(translate('videoEditor.exportDialog.resolutionLabel'));
    expect(picture?.querySelectorAll('input[type="text"]')).toHaveLength(1);
    expect(container.querySelectorAll('input[type="text"]')).toHaveLength(1);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
