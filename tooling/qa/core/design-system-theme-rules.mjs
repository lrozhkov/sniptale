import fs from 'node:fs';
import path from 'node:path';
import { collectRecursiveFiles } from './recursive-files.mjs';

export function getDesignSystemThemeFailures(designSystemRoot) {
  const failures = [];
  const designSystemIndexPath = path.join(designSystemRoot, 'index.tsx');
  const designSystemPagePath = path.join(designSystemRoot, 'shell', 'page', 'index.tsx');
  const designSystemThemeSurfacePath = path.join(designSystemRoot, 'theme', 'index.tsx');

  if (!fs.existsSync(designSystemThemeSurfacePath)) {
    failures.push(
      'apps/extension/src/design-system/theme/index.tsx is required for design-system-owned theme scoping'
    );
    return failures;
  }

  const designSystemIndexSource = fs.readFileSync(designSystemIndexPath, 'utf8');
  const designSystemPageSource = fs.readFileSync(designSystemPagePath, 'utf8');
  const designSystemThemeSurfaceSource = fs.readFileSync(designSystemThemeSurfacePath, 'utf8');

  if (/initializeAppTheme\s*\(/.test(designSystemIndexSource)) {
    failures.push(
      'apps/extension/src/design-system/index.tsx must not initialize a global app theme'
    );
  }

  if (!/DesignSystemThemeSurface/.test(designSystemIndexSource)) {
    failures.push(
      'apps/extension/src/design-system/index.tsx must render through DesignSystemThemeSurface'
    );
  }

  if (!/data-ui="design-system\.theme-surface"/.test(designSystemThemeSurfaceSource)) {
    failures.push(
      'apps/extension/src/design-system/theme/index.tsx must expose data-ui="design-system.theme-surface"'
    );
  }

  if (!/useDesignSystemThemeSurface\s*\(/.test(designSystemPageSource)) {
    failures.push(
      'apps/extension/src/design-system/shell/page/index.tsx must consume the design-system-owned theme surface'
    );
  }

  return failures;
}

function collectThemePortalFiles(rootDir) {
  return collectRecursiveFiles(rootDir, {
    predicate: (_, entry) => /\.(ts|tsx)$/.test(entry.name),
    returnAbsolute: true,
  });
}

export function getThemeSafePortalFailures(srcRoot) {
  const failures = [];
  const portalRoots = [
    path.join(srcRoot, 'content', 'components'),
    path.join(srcRoot, 'shared', 'ui'),
  ];
  const rawBodyPortalPattern = /createPortal\s*\([\s\S]{0,400}document\.body\s*\)/g;

  for (const rootDir of portalRoots) {
    for (const filePath of collectThemePortalFiles(rootDir)) {
      const source = fs.readFileSync(filePath, 'utf8');
      if (!rawBodyPortalPattern.test(source)) {
        continue;
      }

      const relativePath = path.relative(srcRoot, filePath).replaceAll(path.sep, '/');
      failures.push(
        `src/${relativePath} must not portal directly into document.body; use theme-safe portal helpers`
      );
    }
  }

  return failures;
}
