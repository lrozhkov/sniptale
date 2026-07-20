import { expect, it } from 'vitest';

import type { ScenarioStageLayout } from '../../../../../features/scenario/stage/layout';
import { renderTextOverlay } from './text';

const layout: ScenarioStageLayout = {
  canvas: { width: 720, height: 420 },
  viewport: { x: 0, y: 0, width: 720, height: 420 },
  imageRect: { x: 0, y: 0, width: 720, height: 420 },
  sourceViewport: { width: 1440, height: 840 },
};

it('renders text overlays with escaped content and typography attributes', () => {
  const markup = renderTextOverlay(
    layout,
    {
      id: 'text',
      kind: 'text',
      point: { x: 50, y: 60 },
      text: 'Export & Review <script>',
      color: '" onload="alert(1)',
      fontSize: 24,
      fontFamily: 'system-ui" onload="alert(1)',
      fontWeight: 600,
    },
    '" onload="alert(1)'
  );

  expect(markup).toContain('fill="&quot; onload=&quot;alert(1)"');
  expect(markup).toContain('font-family="system-ui&quot; onload=&quot;alert(1)"');
  expect(markup).toContain('Export &amp; Review &lt;script&gt;');
  expect(markup).toContain('font-weight="600"');
});
