// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
import { translate } from '../../../platform/i18n';
import { WebSnapshotVisualSurface } from './view-mode';

const container = document.createElement('div');
document.body.append(container);
const root = createRoot(container);

afterEach(async () => {
  await act(async () => root.render(<></>));
});

async function renderSurface(coverage: 'full-page' | 'viewport'): Promise<void> {
  await act(async () => {
    root.render(
      <WebSnapshotVisualSurface
        locale="ru"
        screenshotCoverage={coverage}
        screenshotUrl="blob:test-screenshot"
        sourceTitle="Test"
        zoom={1}
      />
    );
  });
}

it('shows a localized warning only for an explicit visible-area preview', async () => {
  await renderSurface('viewport');
  expect(container.textContent).toContain(
    translate('webSnapshotViewer.app.partialScreenshotNotice', 'ru')
  );

  await renderSurface('full-page');
  expect(container.textContent).not.toContain(
    translate('webSnapshotViewer.app.partialScreenshotNotice', 'ru')
  );
});
