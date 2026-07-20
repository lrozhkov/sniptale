import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';

import { translate } from '../../../../../platform/i18n';
import { PresetsListHeader } from './header';

it('renders the header label and preset count', () => {
  const markup = renderToStaticMarkup(
    <PresetsListHeader presetCountLabel="presets" presets={[]} />
  );

  expect(markup).toContain(translate('savePresets.section.folderPresetsLabel'));
  expect(markup).toContain('0 presets');
});
