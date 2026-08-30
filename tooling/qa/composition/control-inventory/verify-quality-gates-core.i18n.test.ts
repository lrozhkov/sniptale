import { expect, it } from 'vitest';

import { createTempRoot, writeFile } from '../../test-support/test-helpers';

it('flags raw JSX text in live product files and allows translated copy', async () => {
  const root = createTempRoot('verify-i18n-jsx-');
  writeFile(
    root,
    'apps/extension/src/content/components/Example.tsx',
    'export function Example() { return <button>Save now</button>; }\n'
  );
  writeFile(
    root,
    'apps/extension/src/content/components/Expression.tsx',
    "export function Expression() { return <button>{'Export now'}</button>; }\n"
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

  const module = await import('../../guards/product-contracts/verify-i18n.mjs');

  expect(
    module.collectFileFailures('apps/extension/src/content/components/Example.tsx', { root })
  ).toEqual([
    'apps/extension/src/content/components/Example.tsx:1 contains raw JSX text "Save now"',
  ]);
  expect(
    module.collectFileFailures('apps/extension/src/content/components/Expression.tsx', { root })
  ).toEqual([
    'apps/extension/src/content/components/Expression.tsx:1 contains raw JSX text "Export now"',
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

it('allows typed locale copy owners without imposing file or function naming', async () => {
  const root = createTempRoot('verify-i18n-typed-copy-');
  const typedCopyFile = 'apps/extension/src/features/example/arbitrary.ts';
  const untypedCopyFile = 'apps/extension/src/features/example/arbitrary.data.ts';
  writeFile(
    root,
    typedCopyFile,
    [
      "import type { AppLocale } from '../../../platform/i18n';",
      'export const choose = (locale: AppLocale) =>',
      "  locale === 'ru' ? { emptyLabel: 'Нет результатов' } : { emptyLabel: 'No results' };",
      '',
    ].join('\n')
  );
  writeFile(root, untypedCopyFile, "export const choose = () => ({ emptyLabel: 'No results' });\n");

  const module = await import('../../guards/product-contracts/verify-i18n.mjs');

  expect(module.collectFileFailures(typedCopyFile, { root })).toEqual([]);
  expect(module.collectFileFailures(untypedCopyFile, { root })).toEqual([
    `${untypedCopyFile}:1 contains raw emptyLabel property "No results"`,
  ]);
});

it('flags raw attribute, toast and progress copy while allowing translated values', async () => {
  const root = createTempRoot('verify-i18n-copy-forms-');
  const attributeFile = 'apps/extension/src/features/example/Attribute.tsx';
  const toastFile = 'apps/extension/src/features/example/toast.ts';
  const progressFile = 'apps/extension/src/features/example/progress.ts';
  const translatedFile = 'apps/extension/src/features/example/Translated.tsx';
  writeFile(
    root,
    attributeFile,
    'export const View = () => <input aria-label="Search files" />;\n'
  );
  writeFile(root, toastFile, "export const notify = () => toast.success('Export complete');\n");
  writeFile(
    root,
    progressFile,
    "export const progress = { phase: 'export', current: 1, total: 2, message: 'Exporting files' };\n"
  );
  writeFile(
    root,
    translatedFile,
    [
      "import { translate } from '../../../platform/i18n';",
      'export function View() {',
      "  toast.success(translate('common.export.complete'));",
      "  const progress = { phase: 'export', current: 1, total: 2, message: translate('common.export.progress') };",
      "  return <input aria-label={translate('common.search.files')} data-progress={progress.current} />;",
      '}',
      '',
    ].join('\n')
  );

  const module = await import('../../guards/product-contracts/verify-i18n.mjs');

  expect(module.collectFileFailures(attributeFile, { root })).toEqual([
    `${attributeFile}:1 contains raw aria-label value "Search files"`,
  ]);
  expect(module.collectFileFailures(toastFile, { root })).toEqual([
    `${toastFile}:1 contains raw toast copy "Export complete"`,
  ]);
  expect(module.collectFileFailures(progressFile, { root })).toEqual([
    `${progressFile}:1 contains raw progress message "Exporting files"`,
  ]);
  expect(module.collectFileFailures(translatedFile, { root })).toEqual([]);
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

  const module = await import('../../guards/product-contracts/verify-i18n.mjs');
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

it('includes scenario UI and current i18n owner changes in the full closure', async () => {
  const root = createTempRoot('verify-i18n-scenario-');
  const scenarioFile = 'apps/extension/src/scenario-editor/export-dialog/Raw.tsx';
  writeFile(root, scenarioFile, 'export function Raw() { return <button>Export now</button>; }\n');

  const verifier = await import('../../guards/product-contracts/verify-i18n.mjs');
  const policy = await import('../../guards/product-contracts/verify-i18n.helpers.mjs');

  expect(verifier.collectFileFailures(scenarioFile, { root })).toHaveLength(1);
  expect(
    policy.isFullI18nScanTrigger('tooling/qa/guards/product-contracts/verify-i18n.helpers.mjs')
  ).toBe(true);
  expect(policy.isFullI18nScanTrigger('tooling/qa/core/verify-i18n.mjs')).toBe(false);
  expect(
    policy.isLiveProductI18nFile(
      'apps/extension/src/features/scenario/project/v3/templates/bundled.data.ts'
    )
  ).toBe(false);
  expect(
    policy.isLiveProductI18nFile('apps/extension/src/features/example/arbitrary.data.ts')
  ).toBe(true);
});
