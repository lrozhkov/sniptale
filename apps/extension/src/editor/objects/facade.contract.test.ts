import { readdirSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const EDITOR_CONTROLLER_ROOT = new URL('../controller/', import.meta.url);
const OWNER_FACTORY_EXPORTS = {
  arrow: [
    'createArrowObject',
    'getArrowGeometry',
    'getArrowInteractionAppearance',
    'getArrowSettings',
    'insertArrowPoint',
    'isArrowObject',
    'normalizeScaledArrowObject',
    'removeArrowPoint',
    'updateArrowObject',
    'updateArrowPointOnDoubleClick',
  ],
  blur: [
    'createBlurObject',
    'getBlurSettings',
    'isBlurObject',
    'normalizeScaledBlurTarget',
    'refreshBlurObjectsForSource',
    'updateBlurObject',
  ],
  browserFrame: ['createBrowserFrameLayerObject', 'createBrowserFrameObjects'],
  shape: ['applyShapeSettings', 'normalizeScaledRectangleTarget'],
  step: ['createStepGroup', 'resolveStepGroupGeometry', 'updateStepGroup'],
  text: [
    'createMetaStamp',
    'createTextObject',
    'DEFAULT_EDITOR_TEXTBOX_WIDTH',
    'applyTextCalloutRendering',
    'getTextCalloutBackgroundColor',
    'getTextCalloutPadding',
    'getTextCalloutPath',
    'normalizeTextCalloutFormat',
    'normalizeTextLayoutMode',
  ],
};

function listSourceFiles(directory: URL): URL[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryUrl = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory);
    if (entry.isDirectory()) {
      return listSourceFiles(entryUrl);
    }
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [entryUrl] : [];
  });
}

function collectRootOwnerFactoryImports(source: string): string[] {
  const rootImports = source.matchAll(
    /import\s*\{(?<imports>[^}]*)\}\s*from\s*['"][^'"]*\/objects(?:\/index)?['"]/g
  );

  return [...rootImports].flatMap((match) => {
    const importedNames = new Set(parseImportedNames(match.groups?.['imports'] ?? ''));
    return Object.entries(OWNER_FACTORY_EXPORTS).flatMap(([owner, names]) =>
      names.filter((name) => importedNames.has(name)).map((name) => `${owner}.${name}`)
    );
  });
}

function parseImportedNames(importList: string): string[] {
  return importList
    .split(',')
    .map(
      (entry) =>
        entry
          .trim()
          .split(/\s+as\s+/u)[0]
          ?.trim() ?? ''
    )
    .filter(Boolean);
}

it('keeps editor-controller owner factory imports on owner-local facades', () => {
  const violations = listSourceFiles(EDITOR_CONTROLLER_ROOT).flatMap((fileUrl) => {
    const source = readFileSync(fileUrl, 'utf8');
    const importedNames = collectRootOwnerFactoryImports(source);
    if (importedNames.length === 0) {
      return [];
    }
    return [`${fileUrl.pathname}: ${importedNames.join(', ')}`];
  });

  expect(violations).toEqual([]);
});
