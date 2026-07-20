import { expect, it } from 'vitest';

import { createScenarioCaptureStep } from '../../../../features/scenario/project/public';
import { resolveScenarioStageLayout } from '../../../../features/scenario/stage/layout';
import { buildScenarioDefs } from './defs';
import { buildMissingAssetSvg } from './missing-asset';
import { buildScenarioImageMarkup } from './image-markup';
import { buildScenarioOverlayMarkup } from './overlays';
import { buildSvgOpenTag } from './open-tag';
import { escapeSvgAttribute, escapeSvgText, formatNumber } from './format';

const layout = resolveScenarioStageLayout(createScenarioCaptureStep({ assetId: 'asset-1' }), {
  width: 1440,
  height: 900,
});

it('formats and escapes shared svg helpers in the canonical owner folder', () => {
  expect(formatNumber(12.345)).toBe('12.35');
  expect(escapeSvgText('Missing & <asset>')).toBe('Missing &amp; &lt;asset&gt;');
  expect(escapeSvgAttribute('" onload="alert(1)')).toBe('&quot; onload=&quot;alert(1)');
  expect(buildSvgOpenTag({ width: 720, height: 420 })).toContain('viewBox="0 0 720 420"');
});

it('renders the stage svg helper branches from the owner-local folder', () => {
  const step = createScenarioCaptureStep({
    assetId: 'asset-1',
    overlays: [],
  });

  expect(buildScenarioDefs('clip', layout.viewport)).toContain('<clipPath id="clip">');
  expect(buildScenarioImageMarkup('data:image/png;base64,cGl4ZWw=', layout)).toContain(
    'preserveAspectRatio="none"'
  );
  expect(
    buildMissingAssetSvg({ width: 720, height: 420 }, '#f3ede2', 'Missing & <asset>')
  ).toContain('Missing &amp; &lt;asset&gt;');
  expect(buildMissingAssetSvg({ width: 720, height: 420 }, '" onload="alert(1)')).toContain(
    'fill="&quot; onload=&quot;alert(1)"'
  );
  expect(buildScenarioImageMarkup('data:image/svg+xml," onload="alert(1)', layout)).toContain(
    'href="data:image/svg+xml,&quot; onload=&quot;alert(1)"'
  );
  expect(buildScenarioOverlayMarkup('data:image/png;base64,cGl4ZWw=', layout, step)).toBe('');
});
