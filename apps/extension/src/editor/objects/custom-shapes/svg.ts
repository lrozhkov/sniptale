import type { EditorCustomShapeDefinition } from '../../../features/editor/document/rich-shape';
import { createCustomShapeImportDiagnostic } from './diagnostics';
import { createStableCustomShapeId } from './ids';
import { collectSvgPathPrimitives, parseSvgViewBox } from './svg-geometry';
import { validateSvgSafety } from './svg-safety';
import type { CustomShapeImportDiagnostic, CustomShapeImportResult } from './types';

function readSvg(input: string): Document | null {
  if (/<!doctype/i.test(input)) {
    return null;
  }

  const document = new DOMParser().parseFromString(input, 'image/svg+xml');
  const root = document.documentElement;
  return root?.localName.toLowerCase() === 'svg' && !document.querySelector('parsererror')
    ? document
    : null;
}

function invalidSvgResult(message: string): CustomShapeImportResult {
  return {
    ok: false,
    diagnostics: [createCustomShapeImportDiagnostic('invalid-svg', message)],
  };
}

function unsafeDoctypeResult(): CustomShapeImportResult {
  return {
    ok: false,
    diagnostics: [createCustomShapeImportDiagnostic('unsafe-svg', 'SVG doctype is not allowed.')],
  };
}

function createDefinition(options: {
  fileName: string;
  root: Element;
  text: string;
  viewBox: NonNullable<ReturnType<typeof parseSvgViewBox>>;
  paths: ReturnType<typeof collectSvgPathPrimitives>;
}): EditorCustomShapeDefinition {
  const label =
    options.root.getAttribute('aria-label') ||
    options.root.querySelector('title')?.textContent?.trim() ||
    options.fileName.replace(/\.[^.]+$/, '');
  return {
    id: createStableCustomShapeId(options.fileName, label, options.text),
    label,
    category: 'custom',
    tags: ['custom', 'svg'],
    capabilities: ['fill', 'line', 'effects'],
    geometry: { type: 'path', viewBox: options.viewBox, paths: options.paths },
  };
}

function unsupportedGeometryResult(
  diagnostics: CustomShapeImportDiagnostic[]
): CustomShapeImportResult {
  return {
    ok: false,
    diagnostics: [
      ...diagnostics,
      createCustomShapeImportDiagnostic(
        'unsupported-geometry',
        'No supported SVG geometry was found.'
      ),
    ],
  };
}

export function parseCustomShapeSvg(input: {
  fileName: string;
  text: string;
}): CustomShapeImportResult {
  if (/<!doctype/i.test(input.text)) {
    return unsafeDoctypeResult();
  }

  const document = readSvg(input.text);
  if (!document) {
    return invalidSvgResult('Invalid SVG document.');
  }

  const root = document.documentElement;
  const safetyDiagnostics = validateSvgSafety(root);
  if (safetyDiagnostics.length > 0) {
    return { ok: false, diagnostics: safetyDiagnostics };
  }

  const viewBox = parseSvgViewBox(root);
  if (!viewBox) {
    return invalidSvgResult('SVG requires a valid viewBox or width and height.');
  }

  const diagnostics: CustomShapeImportDiagnostic[] = [];
  const paths = collectSvgPathPrimitives(root, diagnostics);
  if (paths.length === 0) {
    return unsupportedGeometryResult(diagnostics);
  }

  const definition = createDefinition({
    fileName: input.fileName,
    root,
    text: input.text,
    viewBox,
    paths,
  });
  return { ok: true, definition, definitions: [definition], diagnostics };
}
