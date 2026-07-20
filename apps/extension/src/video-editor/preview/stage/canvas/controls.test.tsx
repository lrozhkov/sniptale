import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

import { PreviewStageControls } from './controls';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

it('presents cache preparation failure separately from unavailable capability', () => {
  const markup = renderToStaticMarkup(
    <PreviewStageControls
      mode="cache"
      onModeChange={vi.fn()}
      onPreferencesRetry={vi.fn()}
      onRasterPresetChange={vi.fn()}
      onZoomChange={vi.fn()}
      preferencesSaveFailed={false}
      rasterPreset="720p"
      status={{
        completedFrames: 1,
        mode: 'cache',
        outcome: 'failed',
        phase: 'recovering',
        totalFrames: 2,
      }}
      zoom="fit"
    />
  );

  expect(markup).toContain('videoEditor.stage.previewCacheFailed');
  expect(markup).not.toContain('videoEditor.stage.previewCacheUnavailable');
  expect(markup).toContain('!w-[92px]');
  expect(markup).toContain('!w-[88px]');
  expect(markup).toContain('absolute right-0 top-11');
});
