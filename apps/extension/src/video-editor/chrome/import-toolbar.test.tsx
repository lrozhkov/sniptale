import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { VideoEditorImportToolbar } from './import-toolbar';

describe('video editor import toolbar', () => {
  it('renders the shared import actions with the stable library action marker', () => {
    const markup = renderToStaticMarkup(
      <VideoEditorImportToolbar
        onCreateProject={vi.fn()}
        onImportAudio={vi.fn()}
        onImportImage={vi.fn()}
        onImportVideo={vi.fn()}
        onRecordAudio={vi.fn()}
        presentation="panel"
      />
    );

    expect(markup.match(/data-ui="video-editor.sidebar.library-action"/g)).toHaveLength(5);
    expect(markup).not.toContain('border-b border-[color:var(--sniptale-color-border-subtle)]');
  });
});
