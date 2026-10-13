import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { readReviewAnnotationEffectDocument } from '../../features/video/review/annotation-effects/validation';
import { reviewAnnotationPresetId } from './annotation-effects-presets';

const document = readReviewAnnotationEffectDocument(
  readFileSync(
    'apps/extension/public/video-effects/effects/annotations/sniptale-callout/effect.sniptale-effect.json',
    'utf8'
  )
);
if (!document) throw new Error('Invalid builtin annotation fixture');
const preset = document.controlPresets![0]!;

it('matches effective defaults and ignores content and geometry overrides', () => {
  expect(reviewAnnotationPresetId(document, {}, 'en')).toBe(preset.id);
  expect(
    reviewAnnotationPresetId(document, { ...preset.values, title: 'Changed', anchorX: 120 }, 'ru')
  ).toBe(preset.id);
  expect(reviewAnnotationPresetId(document, { ...preset.values, accent: '#f00' }, 'en')).toBe('');
});

it('compares parsed RGBA including alpha, with exact fallback for unsupported color syntax', () => {
  const custom = { ...document, controlPresets: [{ ...preset, values: { accent: '#ff000080' } }] };
  expect(
    reviewAnnotationPresetId(custom, { accent: 'rgba(255, 0, 0, 0.5019607843137255)' }, 'en')
  ).toBe(preset.id);
  expect(reviewAnnotationPresetId(custom, { accent: 'rgba(255, 0, 0, 1)' }, 'en')).toBe('');
  const unsupported = {
    ...document,
    controlPresets: [{ ...preset, values: { accent: 'color(display-p3 1 0 0)' } }],
  };
  expect(reviewAnnotationPresetId(unsupported, { accent: 'color(display-p3 1 0 0)' }, 'en')).toBe(
    preset.id
  );
  expect(reviewAnnotationPresetId(unsupported, { accent: 'color(display-p3 0 0 0)' }, 'en')).toBe(
    ''
  );
});

it('uses exact numeric values and refuses ambiguous partial presets without choosing an identity', () => {
  const numeric = { ...document, controlPresets: [{ ...preset, values: { font: 24 } }] };
  expect(reviewAnnotationPresetId(numeric, { font: 24 }, 'en')).toBe(preset.id);
  expect(reviewAnnotationPresetId(numeric, { font: 24.000001 }, 'en')).toBe('');
  const duplicate = {
    ...document,
    controlPresets: [
      preset,
      { ...preset, id: 'other', values: { accent: preset.values['accent']! } },
    ],
  };
  expect(reviewAnnotationPresetId(duplicate, preset.values, 'en')).toBe('');
  expect(reviewAnnotationPresetId({ ...document, controlPresets: [] }, {}, 'en')).toBe('');
});
