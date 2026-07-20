// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { VideoProjectActionPreset } from '../../../../../features/video/project/types';
import { VideoEditorPlacementModeKind } from '../../../../contracts/placement';
import { ActionDetailsFields } from './fields';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));

describe('workspace-sidebar/selection/effect-fields', () => {
  it('renders action details with canonical text input and preset controls', () => {
    const markup = renderToStaticMarkup(
      <ActionDetailsFields
        actionEventId="action-1"
        duration={0.9}
        label="Click here"
        placementModeKind={null}
        point={{ x: 120, y: 240 }}
        preset={VideoProjectActionPreset.SCROLL_EMPHASIS}
        projectHeight={1080}
        projectWidth={1920}
        onClearPlacementMode={vi.fn()}
        onStartActionPointPlacement={vi.fn()}
        onUpdateActionEventDetails={vi.fn()}
      />
    );

    expect(markup).toContain('videoEditor.sidebar.actionPresetLabel');
    expect(markup).toContain('videoEditor.sidebar.textLabel');
    expect(markup).toContain('value="Click here"');
    expect(markup).toContain('videoEditor.sidebar.actionPresetScrollEmphasis');
    expect(markup).toContain('type="range"');
    expect(markup).toContain('videoEditor.sidebar.selectPointOnStage');
  });

  it('renders action point placement as a shared compact toggle action', () => {
    const markup = renderToStaticMarkup(
      <ActionDetailsFields
        actionEventId="action-1"
        duration={0.9}
        label="Click here"
        placementModeKind={VideoEditorPlacementModeKind.ACTION_POINT}
        point={{ x: 120, y: 240 }}
        preset={VideoProjectActionPreset.CLICK_RIPPLE}
        projectHeight={1080}
        projectWidth={1920}
        onClearPlacementMode={vi.fn()}
        onStartActionPointPlacement={vi.fn()}
        onUpdateActionEventDetails={vi.fn()}
      />
    );

    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('shadow-[inset_0_0_0_1px_color-mix');
  });
});
