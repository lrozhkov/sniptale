// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { VideoProjectActionPreset } from '../../../../../features/video/project/types';
import { VideoEditorPlacementModeKind } from '../../../../contracts/placement';
import { ActionPointButtons, ActionPrimaryFields } from './fields';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));

describe('workspace-sidebar/selection/effect-fields', () => {
  it('shows presentation timing including signed offsets without captured text editing', () => {
    const markup = renderToStaticMarkup(
      <ActionPrimaryFields
        duration={0.9}
        offset={-0.25}
        preset={VideoProjectActionPreset.CLICK_PRESS}
        disabled={false}
        onChange={vi.fn()}
      />
    );
    expect(markup).toContain('videoEditor.sidebar.actionPresetLabel');
    expect(markup).toContain('videoEditor.sidebar.historyDuration');
    expect(markup).toContain('videoEditor.sidebar.historyOffset');
    expect(markup).toContain('-0.25');
    expect(markup).not.toContain('videoEditor.sidebar.textLabel');
    expect(markup).toContain('videoEditor.sidebar.actionPresetPress');
  });

  it('disables both placement actions while locked and retains active placement feedback', () => {
    const markup = renderToStaticMarkup(
      <ActionPointButtons
        actionEventId="action-1"
        placementModeKind={VideoEditorPlacementModeKind.ACTION_POINT}
        projectHeight={1080}
        projectWidth={1920}
        disabled={true}
        onClearPlacementMode={vi.fn()}
        onStartActionPointPlacement={vi.fn()}
        onChange={vi.fn()}
      />
    );
    expect(markup).toContain('aria-pressed="true"');
    expect(markup.match(/disabled=""/g)).toHaveLength(2);
    expect(markup).toContain('videoEditor.sidebar.selectPointOnStage');
  });
});
