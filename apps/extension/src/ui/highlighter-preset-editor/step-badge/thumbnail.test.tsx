import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import {
  createSystemStepBadgePresetCatalog,
  DEFAULT_STEP_BADGE_TEMPLATE,
} from '../../../features/highlighter/step-badge-presets/catalog';
import { StepBadgePresetPreview } from './thumbnail';

it('renders compact numeric and letter template previews', () => {
  expect(
    renderToStaticMarkup(<StepBadgePresetPreview compact settings={DEFAULT_STEP_BADGE_TEMPLATE} />)
  ).toContain('>1</span>');
  expect(
    renderToStaticMarkup(
      <StepBadgePresetPreview settings={{ ...DEFAULT_STEP_BADGE_TEMPLATE, type: 'letter' }} />
    )
  ).toContain('>A</span>');
});

it('resolves linked colors and keeps frame-linked sizes consistent in compact previews', () => {
  const presets = createSystemStepBadgePresetCatalog();
  const renderPreset = (id: string) =>
    renderToStaticMarkup(
      <StepBadgePresetPreview
        compact
        settings={presets.find((preset) => preset.id === id)!.settings}
      />
    );

  const outline = renderPreset('system-outline');
  expect(outline).toContain('color:#ffffff');
  expect(outline).toContain('border:3px solid var(--sniptale-color-surface-base)');
  expect(outline).toContain('>1</span>');

  expect(renderPreset('system-compact')).toContain('flex:0 0 22px');
  expect(renderPreset('system-classic')).toContain('flex:0 0 22px');
  expect(renderPreset('system-large')).toContain('flex:0 0 22px');
});
