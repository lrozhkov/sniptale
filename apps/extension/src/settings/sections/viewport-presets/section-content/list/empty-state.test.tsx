import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';

import { translate } from '../../../../../platform/i18n';
import { PresetsListEmptyState } from './empty-state';

it('renders the empty state copy', () => {
  const markup = renderToStaticMarkup(<PresetsListEmptyState />);

  expect(markup).toContain(translate('viewportPresets.section.emptyTitle'));
  expect(markup).toContain(translate('viewportPresets.section.emptyDescription'));
});
