// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { createSystemCalloutPresetCatalog } from '../callout-presets/catalog';
import { FrameCalloutBadge } from './callout-badge';

it('uses the configured badge text when no resolved override is supplied', () => {
  const badge = {
    ...createSystemCalloutPresetCatalog()[0]!.style.badge,
    enabled: true,
    text: 'Configured tag',
  };

  expect(renderToStaticMarkup(<FrameCalloutBadge badge={badge} />)).toContain('Configured tag');
  expect(renderToStaticMarkup(<FrameCalloutBadge badge={{ ...badge, enabled: false }} />)).toBe('');
});
