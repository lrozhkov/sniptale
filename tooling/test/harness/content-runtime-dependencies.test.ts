import { build } from 'esbuild';
import { expect, it } from 'vitest';
import {
  assertContentRuntimeMessagingInputsAreCompact,
  assertInjectedI18nInputsAreScoped,
  createReleaseSafeDependencyAliasPlugin,
} from '../../../apps/extension/build/injected-build-support';
import { esbuildI18nCatalogs } from '../../../apps/extension/build/i18n-catalogs';

it.each([
  'src/features/video/project/validation/index.ts',
  'src/features/video/project/validation/root.ts',
  'src/features/video/project/transition/gl-catalog.generated.json',
  '../../packages/runtime-contracts/src/animation-template/lottie-schema.generated.js',
  'C:\\repo\\apps\\extension\\src\\features\\video\\project\\validation\\root.ts',
])('rejects full project admission dependency %s from content', (path) => {
  expect(() => assertContentRuntimeMessagingInputsAreCompact({ [path]: {} })).toThrow(
    'Content runtime must not include full video project admission dependencies'
  );
});

it('permits recording telemetry and export settings required by content messages', () => {
  expect(() =>
    assertContentRuntimeMessagingInputsAreCompact({
      'src/features/video/project/validation/recording-telemetry.ts': {},
      'src/features/video/project/export/settings-validation.ts': {},
    })
  ).not.toThrow();
});

it('bundles the real runtime transport without full video project admission', async () => {
  const result = await build({
    absWorkingDir: process.cwd(),
    entryPoints: ['apps/extension/src/platform/runtime-messaging/chrome-transport.ts'],
    bundle: true,
    write: false,
    metafile: true,
    platform: 'browser',
    format: 'esm',
    plugins: [createReleaseSafeDependencyAliasPlugin(process.cwd())],
  });
  expect(() => assertContentRuntimeMessagingInputsAreCompact(result.metafile.inputs)).not.toThrow();
  expect(() => assertInjectedI18nInputsAreScoped(result.metafile.inputs)).not.toThrow();
});

it.each([
  'src/platform/i18n/catalogs/en.json',
  'apps/extension/src/platform/i18n/catalogs/ru.json',
  '/home/user/repo/apps/extension/src/platform/i18n/catalogs/de.json',
  '../../apps/extension/src/platform/i18n/catalogs/fr.json',
  'C:\\repo\\apps\\extension\\src\\platform\\i18n\\catalogs\\ja.json',
  'src\\platform\\i18n\\catalogs\\es.json',
  'src/platform/i18n/catalogs/en.json?import',
  'sniptale-i18n:popup',
  'sniptale-i18n:popup-shell',
  'sniptale-i18n:content-shim',
])('rejects eager translation data %s from an injected bundle', (path) => {
  expect(() => assertInjectedI18nInputsAreScoped({ [path]: {} })).toThrow(
    'Injected startup JavaScript must not import authored catalogs or all-language projections'
  );
});

it.each(['popup', 'popup-shell', 'content-shim'])(
  'rejects an emitted all-language %s projection in an injected bundle',
  async (profile) => {
    const result = await build({
      stdin: {
        contents: `export { catalogs } from 'sniptale:i18n/${profile}';`,
        resolveDir: process.cwd(),
      },
      bundle: true,
      write: false,
      metafile: true,
      format: 'esm',
      plugins: [esbuildI18nCatalogs(process.cwd())],
    });
    expect(() => assertInjectedI18nInputsAreScoped(result.metafile.inputs)).toThrow(
      `sniptale-i18n:${profile}`
    );
  }
);

it('permits the emitted English-only bootstrap projection without full catalogs', async () => {
  const result = await build({
    stdin: {
      contents: `export { catalogs } from 'sniptale:i18n/bootstrap';`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    metafile: true,
    format: 'esm',
    plugins: [esbuildI18nCatalogs(process.cwd())],
  });
  expect(Object.keys(result.metafile.inputs)).toContain('sniptale-i18n:bootstrap');
  expect(() => assertInjectedI18nInputsAreScoped(result.metafile.inputs)).not.toThrow();
});
