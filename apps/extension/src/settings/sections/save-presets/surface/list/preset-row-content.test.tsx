import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';

import { translate } from '../../../../../platform/i18n';
import { PresetRowContent } from './preset-row-content';

it('renders the path fallback when the preset path is empty', () => {
  const markup = renderToStaticMarkup(
    <PresetRowContent
      preset={{
        id: 'preset-1',
        name: 'Downloads',
        path: '',
        enabled: true,
        order: 1,
      }}
    />
  );

  expect(markup).toContain(translate('savePresets.editor.downloadsPrefix'));
  expect(markup).toContain(translate('savePresets.editor.downloadsSuffix'));
  expect(markup).toContain('…');
});
