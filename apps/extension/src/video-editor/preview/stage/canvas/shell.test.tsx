import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../platform/i18n/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n/index')>()),
  translate: (key: string) => key,
}));

import { PreviewStageShellLayout } from './shell';

describe('preview-stage/shell', () => {
  it('renders the fullscreen stage action with shared content toolbar chrome', () => {
    const markup = renderToStaticMarkup(
      <PreviewStageShellLayout
        currentTime={0}
        duration={10}
        isFullscreen={false}
        isPlaying={false}
        playbackRange={null}
        onOpenFullscreen={() => undefined}
      >
        <div>Stage</div>
      </PreviewStageShellLayout>
    );

    expect(markup).toContain('videoEditor.stage.enterFullscreen');
    expect(markup).toContain('data-ui="shared.ui.content-toolbar-button"');
    expect(markup).toContain('sniptale-glass-toolbar-button');
    expect(markup).toContain('!w-9');
  });
});
