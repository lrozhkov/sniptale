// @vitest-environment jsdom

import { afterEach, expect, it } from 'vitest';
import { AREA_SELECTION_TOOLTIP_ID } from '@sniptale/ui/branding';
import { showAreaSelectionTooltip } from './helpers';

afterEach(() => {
  document.body.replaceChildren();
});

it('replaces an existing area selection tooltip before mounting a new one', () => {
  showAreaSelectionTooltip();
  showAreaSelectionTooltip();

  expect(document.querySelectorAll(`#${AREA_SELECTION_TOOLTIP_ID}`)).toHaveLength(1);
});
