// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  VideoCursorAnimationPreset,
  VideoCursorCaptureMode,
  VideoCursorVisualPreset,
} from '../../../../../features/video/project/types';
import { CursorSkinFields } from './cursor-fields';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));

describe('workspace-sidebar/selection/cursor-fields', () => {
  it('renders cursor skin controls with canonical color and select surfaces', () => {
    const markup = renderToStaticMarkup(
      <CursorSkinFields
        animationPreset={VideoCursorAnimationPreset.FLOAT}
        captureMode={VideoCursorCaptureMode.SEPARATE}
        color="#00ff88"
        hidden={false}
        preset={VideoCursorVisualPreset.RING}
        recentColors={['#123456']}
        scale={1.6}
        shadow
        onRememberRecentColor={vi.fn(async () => undefined)}
        onSetCursorCaptureMode={vi.fn()}
        onUpdateCursorSkin={vi.fn()}
      />
    );

    expect(markup).toContain('data-ui="shared.ui.color-selector"');
    expect(markup).toContain('videoEditor.sidebar.cursorCaptureModeLabel');
    expect(markup).toContain('videoEditor.sidebar.cursorCaptureModeSeparate');
    expect(markup).not.toContain('videoEditor.sidebar.cursorCaptureModeFallback');
    const surface = document.createElement('div');
    surface.innerHTML = markup;
    expect(
      Array.from(surface.querySelectorAll('button')).some((button) =>
        button.textContent?.includes('cursorCaptureMode')
      )
    ).toBe(false);
    expect(markup).toContain('videoEditor.sidebar.cursorPresetLabel');
    expect(markup).toContain('videoEditor.sidebar.cursorAnimationLabel');
    expect(markup).toContain('videoEditor.sidebar.cursorColorLabel');
    expect(markup).toContain('type="range"');
  });
});
