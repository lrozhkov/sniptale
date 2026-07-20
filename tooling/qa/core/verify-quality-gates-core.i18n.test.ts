import { expect, it } from 'vitest';

import { createTempRoot, writeFile } from './test-helpers';

it('flags raw JSX text in live product files and allows translated copy', async () => {
  const root = createTempRoot('verify-i18n-jsx-');
  writeFile(
    root,
    'apps/extension/src/content/components/Example.tsx',
    'export function Example() { return <button>Save now</button>; }\n'
  );
  writeFile(
    root,
    'apps/extension/src/settings/sections/appearance/Translated.tsx',
    [
      "import { translate } from '../../../../../src/shared/i18n';",
      'export function Translated() {',
      "  return <button>{translate('common.actions.save')}</button>;",
      '}',
      '',
    ].join('\n')
  );
  writeFile(
    root,
    'apps/extension/src/design-system/parity/Preview.tsx',
    'export function Preview() { return <button>Preview only</button>; }\n'
  );

  const module = await import('./verify-i18n.mjs');

  expect(
    module.collectFileFailures('apps/extension/src/content/components/Example.tsx', { root })
  ).toEqual([
    'apps/extension/src/content/components/Example.tsx:1 contains raw JSX text "Save now"',
  ]);
  expect(
    module.collectFileFailures('apps/extension/src/settings/sections/appearance/Translated.tsx', {
      root,
    })
  ).toEqual([]);
  expect(
    module.collectFileFailures('apps/extension/src/design-system/parity/Preview.tsx', { root })
  ).toEqual([]);
});

it('runs verify-i18n against a custom live-product file list and skips excluded files', async () => {
  const root = createTempRoot('verify-i18n-');
  writeFile(
    root,
    'apps/extension/src/features/media-hub/report.ts',
    "export const report = { title: 'Heavy Files' };\n"
  );
  writeFile(
    root,
    'apps/extension/src/content/parser/parsers/generic/example.ts',
    "export const parsed = { title: 'Parser title' };\n"
  );

  const module = await import('./verify-i18n.mjs');
  expect(
    module.runI18nCheck({ files: ['apps/extension/src/features/media-hub/report.ts'], root })
  ).toEqual([
    'apps/extension/src/features/media-hub/report.ts:1 contains raw title property "Heavy Files"',
  ]);
  expect(
    module.runI18nCheck({
      files: ['apps/extension/src/content/parser/parsers/generic/example.ts'],
      root,
    })
  ).toEqual([]);
});
