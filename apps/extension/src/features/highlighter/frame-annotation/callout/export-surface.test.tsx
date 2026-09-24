// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { createFrameAnnotationSnapshot } from '../model';
import { createDefaultFrameCallout } from '../defaults';
import { FrameCalloutExportSurface } from './export-surface';

it('renders an exported comment with the default identity coordinate space', async () => {
  const host = document.createElement('div');
  const portalTarget = document.createElement('div');
  document.body.append(host, portalTarget);
  const root = createRoot(host);
  const callout = {
    ...createDefaultFrameCallout(),
    content: { bodyHtml: 'Exported comment', titleText: '' },
  };
  const frame = createFrameAnnotationSnapshot(
    { id: 'frame-export', x: 10, y: 20, width: 200, height: 100, callout },
    0
  );

  try {
    await act(async () =>
      root.render(
        <FrameCalloutExportSurface callout={callout} frame={frame} portalTarget={portalTarget} />
      )
    );
    expect(portalTarget.querySelector('.sniptale-callout')?.textContent).toContain(
      'Exported comment'
    );
    expect(
      portalTarget.querySelector('[data-ui="content.callout.surface-compositor"]')
    ).not.toBeNull();
  } finally {
    act(() => root.unmount());
    host.remove();
    portalTarget.remove();
  }
});
