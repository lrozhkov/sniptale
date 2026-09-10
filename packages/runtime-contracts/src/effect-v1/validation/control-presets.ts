import { isRecord, rejectUnknownKeys, requireIdentifier, validateLocaleText } from './shared.js';
const PRESET_KEYS = new Set(['id', 'label', 'theme', 'style', 'values']);
const NAMED_KEYS = new Set(['id', 'label']);
const VISUAL_GROUPS = new Set(['appearance', 'typography', 'processing', 'animation']);
type Report = import('./shared.js').EffectV1DiagnosticReporter;

export function validateEffectV1ControlPresets(
  document: Record<string, unknown>,
  report: Report
): void {
  const presets = document['controlPresets'];
  const defaultId = document['defaultControlPresetId'];
  if (presets === undefined && defaultId === undefined) return;
  if (!Array.isArray(presets) || presets.length < 1 || presets.length > 64) {
    report.error('CONTROL_PRESETS', '$.controlPresets', 'Expected 1–64 visual control presets.');
    return;
  }
  requireIdentifier(defaultId, '$.defaultControlPresetId', report);
  const ids = new Set<string>();
  const labels = new Map<string, string>();
  for (const [index, preset] of presets.entries()) {
    const path = `$.controlPresets[${index}]`;
    if (!isRecord(preset)) {
      report.error('CONTROL_PRESET', path, 'Expected a visual preset object.');
      continue;
    }
    rejectUnknownKeys(preset, PRESET_KEYS, path, report);
    if (requireIdentifier(preset['id'], `${path}.id`, report)) {
      if (ids.has(preset['id']))
        report.error('CONTROL_PRESET_DUPLICATE', `${path}.id`, 'Preset IDs must be unique.');
      ids.add(preset['id']);
    }
    validateLocaleText(preset['label'], `${path}.label`, false, report);
    for (const key of ['theme', 'style']) {
      const named = preset[key];
      if (!isRecord(named)) {
        report.error(
          'CONTROL_PRESET_IDENTITY',
          `${path}.${key}`,
          'Expected a named theme or style.'
        );
        continue;
      }
      rejectUnknownKeys(named, NAMED_KEYS, `${path}.${key}`, report);
      requireIdentifier(named['id'], `${path}.${key}.id`, report);
      validateLocaleText(named['label'], `${path}.${key}.label`, false, report);
      if (isRecord(named['label'])) {
        const label = JSON.stringify(
          Object.entries(named['label']).sort(([a], [b]) => a.localeCompare(b))
        );
        const identity = `${key}:${named['id']}`;
        if (labels.has(identity) && labels.get(identity) !== label)
          report.error(
            'CONTROL_PRESET_IDENTITY_CONFLICT',
            `${path}.${key}.label`,
            'Shared identities must have identical labels.'
          );
        labels.set(identity, label);
      }
    }
    inspectControlPresetValues(document, preset['values'], `${path}.values`, report);
  }
  if (!ids.has(defaultId as string))
    report.error(
      'CONTROL_PRESET_DEFAULT',
      '$.defaultControlPresetId',
      'Default must reference a declared preset.'
    );
}

export function inspectControlPresetValues(
  document: { controls?: unknown; objectLayout?: unknown },
  values: unknown,
  path: string,
  report: Report
): void {
  const controls = new Map(
    (Array.isArray(document['controls']) ? document['controls'] : [])
      .filter(isRecord)
      .map((c) => [c['id'], c])
  );
  const layout = document['objectLayout'];
  const handles =
    isRecord(layout) && Array.isArray(layout['handles']) ? layout['handles'].filter(isRecord) : [];
  const protectedIds = new Set(handles.flatMap((h) => [h['xControl'], h['yControl']]));
  if (!isRecord(values) || Object.keys(values).length < 1 || Object.keys(values).length > 256) {
    report.error('CONTROL_PRESET_VALUES', path, 'Expected 1–256 control overrides.');
    return;
  }
  for (const [id, value] of Object.entries(values)) {
    const valuePath = `${path}.${id}`;
    if (!requireIdentifier(id, valuePath, report)) continue;
    const control = controls.get(id);
    if (!control) {
      report.error(
        'CONTROL_PRESET_CONTROL',
        valuePath,
        'Override must reference a declared control.'
      );
      continue;
    }
    if (
      control['kind'] === 'text' ||
      typeof control['group'] !== 'string' ||
      !VISUAL_GROUPS.has(control['group']) ||
      protectedIds.has(id)
    ) {
      report.error(
        'CONTROL_PRESET_PROTECTED',
        valuePath,
        'Visual presets cannot overwrite text, geometry, handles or unclassified controls.'
      );
      continue;
    }
    const valid =
      control['kind'] === 'number'
        ? typeof value === 'number' &&
          Number.isFinite(value) &&
          (typeof control['min'] !== 'number' || value >= control['min']) &&
          (typeof control['max'] !== 'number' || value <= control['max'])
        : control['kind'] === 'color' && typeof value === 'string';
    if (!valid)
      report.error(
        'CONTROL_PRESET_VALUE',
        valuePath,
        'Override must match the control type and numeric range.'
      );
    if (
      Array.isArray(control['options']) &&
      !control['options'].some((o) => isRecord(o) && o['value'] === value)
    )
      report.error('CONTROL_PRESET_OPTION', valuePath, 'Override must be an option value.');
  }
}
