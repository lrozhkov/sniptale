import {
  type EffectV1DiagnosticReporter,
  isRecord,
  rejectUnknownKeys,
  requireIdentifier,
  validateLocaleText,
} from '../validation/shared.js';
const KEYS = new Set([
  'id',
  'label',
  'kind',
  'units',
  'position',
  'inset',
  'xControl',
  'yControl',
  'widthControl',
  'heightControl',
]);
export function validateEffectV1EditorRegion(
  document: Record<string, unknown>,
  report: EffectV1DiagnosticReporter
): void {
  const region = document['editorRegion'];
  if (region === undefined) return;
  if (!isRecord(region)) {
    report.error('EDITOR_REGION', '$.editorRegion', 'Expected a rectangular editor region.');
    return;
  }
  rejectUnknownKeys(region, KEYS, '$.editorRegion', report);
  if (document['kind'] !== 'targetEffect')
    report.error('EDITOR_REGION_KIND', '$.editorRegion', 'Editor regions require targetEffect.');
  requireIdentifier(region['id'], '$.editorRegion.id', report);
  validateLocaleText(region['label'], '$.editorRegion.label', false, report);
  if (
    region['kind'] !== 'rect' ||
    region['units'] !== 'percent' ||
    region['position'] !== 'available-space'
  )
    report.error(
      'EDITOR_REGION_COORDINATES',
      '$.editorRegion',
      'Expected rect with percent units and available-space positioning.'
    );
  const inset = region['inset'];
  if (typeof inset !== 'number' || !Number.isFinite(inset) || inset < 0 || inset > 0.25)
    report.error(
      'EDITOR_REGION_INSET',
      '$.editorRegion.inset',
      'Expected inset between 0 and 0.25 of the shorter target dimension.'
    );
  const controls = Array.isArray(document['controls']) ? document['controls'].filter(isRecord) : [];
  const ids = new Set<string>();
  for (const key of ['xControl', 'yControl', 'widthControl', 'heightControl']) {
    const id = region[key];
    const path = `$.editorRegion.${key}`;
    if (!requireIdentifier(id, path, report)) continue;
    if (ids.has(id))
      report.error('EDITOR_REGION_DUPLICATE', path, 'Region bindings must be distinct.');
    ids.add(id);
    const c = controls.find((c) => c['id'] === id);
    const dimension = key === 'widthControl' || key === 'heightControl';
    const max = dimension && typeof inset === 'number' ? 100 - 200 * inset : 100;
    if (
      !c ||
      c['kind'] !== 'number' ||
      c['group'] !== 'geometry' ||
      typeof c['min'] !== 'number' ||
      typeof c['max'] !== 'number' ||
      !Number.isFinite(c['min']) ||
      !Number.isFinite(c['max']) ||
      c['min'] < 0 ||
      (dimension && c['min'] <= 0) ||
      c['max'] > max ||
      c['options'] !== undefined
    )
      report.error(
        'EDITOR_REGION_CONTROL',
        path,
        'Expected a bounded numeric geometry control without options; dimensions must fit inside the inset.'
      );
  }
}
