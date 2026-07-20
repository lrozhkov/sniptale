import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import { VideoEditorStatusScreen } from '.';

describe('video editor status screen', () => {
  it('renders the loading shell with localized project-opening copy', () => {
    const markup = renderToStaticMarkup(<VideoEditorStatusScreen mode="loading" />);

    expect(markup).toContain('videoEditor.app.openingProject');
    expect(markup).not.toContain('videoEditor.app.openFailed');
  });

  it('renders explicit and fallback error copy', () => {
    expect(
      renderToStaticMarkup(<VideoEditorStatusScreen mode="error" error="Project failed" />)
    ).toContain('Project failed');
    expect(renderToStaticMarkup(<VideoEditorStatusScreen mode="error" error="" />)).toContain(
      'videoEditor.app.projectMissing'
    );
  });
});
