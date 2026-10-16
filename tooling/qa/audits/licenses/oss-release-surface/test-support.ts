import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const INTERFACE_FONT_SOURCE_PATH = 'packages/ui/src/styles/golos-ui/golos-ui-vf.woff2';

function write(root: string, relativePath: string, contents: string | Buffer) {
  const destination = path.join(root, relativePath);
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, contents);
}

export function seedInterfaceFontSources(root: string, font: Buffer, license: string) {
  write(root, 'packages/ui/src/styles/golos-ui/LICENSE.txt', license);
  write(root, INTERFACE_FONT_SOURCE_PATH, font);
  write(
    root,
    'packages/ui/package.json',
    JSON.stringify({
      name: '@sniptale/ui',
      author: 'Lev Rozhkov',
      license: 'AGPL-3.0-or-later',
      exports: {
        './styles/interface-font': './src/styles/golos-ui/golos-ui-vf.woff2',
        './styles/interface-font-license': './src/styles/golos-ui/LICENSE.txt',
      },
    })
  );
}

export function seedInterfaceFontConsumers(root: string) {
  const fontPath = 'assets/golos-ui-vf.woff2';
  write(
    root,
    'apps/extension/manifest.json',
    JSON.stringify({ web_accessible_resources: [{ resources: [fontPath] }] })
  );
  write(root, 'apps/extension/build/layout.data.json', JSON.stringify({ required: [fontPath] }));
  write(root, 'apps/extension/vite.config.ts', `${fontPath}\n`);
  write(root, 'packages/ui/src/styles/fonts.css', `${fontPath}\n`);
}

export function seedDocumentFont(root: string) {
  const policyPath = 'tooling/configs/qa/oss-release.data.json';
  const repositoryPolicy = JSON.parse(readFileSync(path.resolve(policyPath), 'utf8'));
  const asset = repositoryPolicy.bundledAssets.find(
    (entry: { id: string }) => entry.id === 'golos-text'
  );
  for (const relativePath of [asset.licensePath, asset.artifacts[0].path]) {
    write(root, relativePath, readFileSync(path.resolve(relativePath)));
  }
  const packageJson = JSON.parse(readFileSync(path.join(root, 'packages/ui/package.json'), 'utf8'));
  packageJson.exports['./styles/document-font'] = './src/styles/golos-text/golos-text-vf.woff2';
  packageJson.exports['./styles/document-font-license'] = './src/styles/golos-text/LICENSE.txt';
  write(root, 'packages/ui/package.json', JSON.stringify(packageJson));
  write(root, 'packages/ui/src/styles/fonts.css', 'golos-ui-vf.woff2 golos-text-vf.woff2');
  write(
    root,
    'apps/extension/build/layout.data.json',
    JSON.stringify({ required: ['assets/golos-ui-vf.woff2', 'assets/golos-text-vf.woff2'] })
  );
  return asset;
}
