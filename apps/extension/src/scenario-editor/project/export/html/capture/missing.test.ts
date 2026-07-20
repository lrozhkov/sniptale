import { expect, it, vi } from 'vitest';

vi.mock('../../../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

import { renderMissingCaptureStepHtml } from './missing';

it('renders missing asset copy inside the missing capture section', () => {
  const result = renderMissingCaptureStepHtml('Heading', '<p class="step-body">Body</p>', 1);

  expect(result.lightboxHtml).toBeUndefined();
  expect(result.sectionHtml).toContain('missing-step');
  expect(result.sectionHtml).toContain('scenario.editor.exportMissingAsset');
  expect(result.sectionHtml).toContain('scenario.editor.exportMissingAssetHint');
});
