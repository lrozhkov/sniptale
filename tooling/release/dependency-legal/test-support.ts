import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

interface PackageFixture {
  dependencies?: Record<string, string>;
  files?: Record<string, string>;
  iconSetInfo?: object;
  integrity?: string;
  license?: string;
  name: string;
  optionalDependencies?: Record<string, string>;
  packagePath?: string;
  repository?: object | string;
  resolved?: string;
  version?: string;
}

interface LegalFixtureOptions {
  appDependencies?: Record<string, string>;
  packages?: PackageFixture[];
  rootDependencies?: Record<string, string>;
}

async function writePackage(root: string, fixture: PackageFixture) {
  const packagePath = fixture.packagePath ?? `node_modules/${fixture.name}`;
  const version = fixture.version ?? '1.0.0';
  await fs.mkdir(path.join(root, packagePath), { recursive: true });
  await fs.writeFile(
    path.join(root, packagePath, 'package.json'),
    JSON.stringify({
      homepage: `https://example.test/${fixture.name}`,
      iconSetInfo: fixture.iconSetInfo,
      license: fixture.license ?? 'MIT',
      name: fixture.name,
      repository: fixture.repository,
      version,
    })
  );
  for (const [fileName, contents] of Object.entries(fixture.files ?? {})) {
    await fs.writeFile(path.join(root, packagePath, fileName), contents);
  }
  return {
    dependencies: fixture.dependencies,
    integrity:
      fixture.integrity ?? `sha512-${Buffer.from(`${fixture.name}@${version}`).toString('base64')}`,
    license: fixture.license ?? 'MIT',
    optionalDependencies: fixture.optionalDependencies,
    packagePath,
    resolved: fixture.resolved ?? `https://registry.example.test/${fixture.name}/-/${version}.tgz`,
    version,
  };
}

export async function createLegalFixture({
  appDependencies = {},
  packages: packageFixtures = [],
  rootDependencies = {},
}: LegalFixtureOptions = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sniptale-dependency-legal-'));
  const packages: Record<string, object> = {
    '': { dependencies: rootDependencies },
    'apps/extension': {
      dependencies: appDependencies,
      name: '@sniptale/extension',
      version: '0.0.0',
    },
  };
  for (const fixture of packageFixtures) {
    const record = await writePackage(root, fixture);
    packages[record.packagePath] = {
      dependencies: record.dependencies,
      integrity: record.integrity,
      license: record.license,
      optionalDependencies: record.optionalDependencies,
      resolved: record.resolved,
      version: record.version,
    };
  }
  await fs.writeFile(
    path.join(root, 'package-lock.json'),
    JSON.stringify({ lockfileVersion: 3, packages })
  );
  return root;
}

export const TEST_MANROPE = {
  artifacts: [
    {
      path: 'fonts/manrope-latin.woff2',
      sha256: 'a'.repeat(64),
      sourcePath: 'node_modules/@fontsource-variable/manrope/files/manrope-latin.woff2',
    },
    {
      path: 'fonts/manrope-cyrillic.woff2',
      sha256: 'b'.repeat(64),
      sourcePath: 'node_modules/@fontsource-variable/manrope/files/manrope-cyrillic.woff2',
    },
  ],
  copyright: 'Copyright 2019 The Manrope Project Authors',
  license: 'OFL-1.1',
  licensePath: 'LICENSES/OFL-1.1.txt',
  sourcePackage: '@fontsource-variable/manrope',
  version: '5.2.8',
};
