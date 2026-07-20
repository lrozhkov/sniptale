import { writeFile } from './test-helpers';

export function createLicensePolicy(
  root: string,
  { mode = 'hardfail', reviewedExceptions }: { mode?: string; reviewedExceptions?: object[] } = {}
) {
  const exceptions = reviewedExceptions ?? [
    {
      packageName: 'eslint-plugin-sonarjs',
      resolvedVersion: '4.0.3',
      dependencyScope: 'direct-development',
      artifactInclusion: 'development-only',
      licenseExpression: 'LGPL-3.0-only',
      reason: 'tooling exception',
      debtId: 'td.test.license-exception',
      approvalOwner: 'test-owner',
      expiresOn: '2099-01-01',
    },
  ];
  return writeFile(
    root,
    'licenses.json',
    JSON.stringify({
      mode,
      firstPartyLicense: 'AGPL-3.0-or-later',
      deniedLicenses: ['LGPL-3.0-only'],
      reviewedExceptions: exceptions,
    })
  );
}

export function createLicenseSbom() {
  return JSON.stringify({
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    components: [
      {
        type: 'library',
        name: 'eslint-plugin-sonarjs',
        version: '4.0.3',
        licenses: [{ license: { id: 'LGPL-3.0-only' } }],
        properties: [
          { name: 'cdx:npm:package:path', value: 'node_modules/eslint-plugin-sonarjs' },
          { name: 'cdx:npm:package:development', value: 'true' },
        ],
      },
      { type: 'library', name: 'unknown-package', version: '1.0.0' },
    ],
  });
}

export function createLicenseLock(root: string, { runtime = false } = {}) {
  return writeFile(
    root,
    'package-lock.json',
    JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': runtime
          ? { dependencies: { 'eslint-plugin-sonarjs': '4.0.3' } }
          : { devDependencies: { 'eslint-plugin-sonarjs': '4.0.3' } },
        'node_modules/eslint-plugin-sonarjs': {
          version: '4.0.3',
          ...(runtime ? {} : { dev: true }),
        },
      },
    })
  );
}

export function createReviewedExceptionSbom({ developmentProperty = 'true' } = {}) {
  return JSON.stringify({
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    components: [
      {
        type: 'library',
        name: 'eslint-plugin-sonarjs',
        version: '4.0.3',
        licenses: [{ license: { id: 'LGPL-3.0-only' } }],
        properties: [
          { name: 'cdx:npm:package:path', value: 'node_modules/eslint-plugin-sonarjs' },
          { name: 'cdx:npm:package:development', value: developmentProperty },
        ],
      },
    ],
  });
}
