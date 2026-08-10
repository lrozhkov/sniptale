import { expect, it } from 'vitest';

import { projectBorderPresetToAppliedSettings } from '@sniptale/runtime-contracts/highlighter/border-preset';
import { createFrameAnnotationSnapshot, parseFrameAnnotationSnapshot } from '.';
import { createDefaultHighlighterSettings } from '../style/defaults';

it('folds legacy frame paint opacity into existing color alpha at the read boundary', () => {
  const defaults = createDefaultHighlighterSettings();
  const borderSettings = projectBorderPresetToAppliedSettings(defaults.borderPresets[0]!);
  const snapshot = createFrameAnnotationSnapshot(
    {
      id: 'legacy-alpha-frame',
      x: 0,
      y: 0,
      width: 100,
      height: 80,
      borderSettings,
      blurSettings: {
        amount: 8,
        blurType: 'gaussian',
        showBorder: true,
        strokeColor: '#11223380',
        strokeWidth: 2,
      },
    },
    0
  );
  const { fillPaint: _canonicalFillPaint, ...legacyBorderSettings } = snapshot.borderSettings!;
  const parsed = parseFrameAnnotationSnapshot({
    ...snapshot,
    borderSettings: {
      ...legacyBorderSettings,
      color: '#33669980',
      fillColor: '#abcdef80',
      opacity: 0.5,
      fillOpacity: 50,
    },
    blurSettings: { ...snapshot.blurSettings, strokeOpacity: 0.5 },
  });

  expect(parsed?.borderSettings?.color).toBe('#33669940');
  expect(parsed?.borderSettings?.fillPaint).toEqual({ kind: 'solid', color: '#abcdef40' });
  expect(parsed?.blurSettings?.strokeColor).toBe('#11223340');
  expect(parsed?.borderSettings).not.toHaveProperty('opacity');
  expect(parsed?.borderSettings).not.toHaveProperty('fillOpacity');
  expect(parsed?.blurSettings).not.toHaveProperty('strokeOpacity');

  const transparent = parseFrameAnnotationSnapshot({
    ...snapshot,
    borderSettings: { ...snapshot.borderSettings, color: 'transparent' },
  });
  expect(transparent?.borderSettings?.color).toBe('transparent');
});
