import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const MANROPE_INSTALLED_FONT_PATH =
  'node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2';

function write(root: string, relativePath: string, contents: string | Buffer) {
  const destination = path.join(root, relativePath);
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, contents);
}

export function seedManropeInstalledSources(root: string, font: Buffer, license: string) {
  write(root, 'node_modules/@fontsource-variable/manrope/LICENSE', license);
  write(root, MANROPE_INSTALLED_FONT_PATH, font);
}

export function seedManropeConsumers(root: string) {
  const fontPath = 'fonts/manrope-latin-wght-normal.woff2';
  write(
    root,
    'apps/extension/manifest.json',
    JSON.stringify({ web_accessible_resources: [{ resources: [fontPath] }] })
  );
  write(root, 'apps/extension/build/layout.data.json', JSON.stringify({ required: [fontPath] }));
  write(root, 'apps/extension/vite.config.ts', `${fontPath}\n`);
  write(root, 'packages/ui/src/styles/fonts.css', `${fontPath}\n`);
}
