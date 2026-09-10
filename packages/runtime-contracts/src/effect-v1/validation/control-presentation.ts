import {
  isRecord,
  rejectUnknownKeys,
  requireIdentifier,
  validateLocaleText,
  type EffectV1Record,
  type EffectV1DiagnosticReporter,
} from './shared.js';

const GROUPS = new Set([
  'content',
  'typography',
  'appearance',
  'geometry',
  'processing',
  'animation',
  'advanced',
]);
const OPTION_KEYS = new Set(['value', 'label']);

export function validateControlPresentation(
  control: EffectV1Record,
  path: string,
  report: EffectV1DiagnosticReporter
): void {
  if (
    control['group'] !== undefined &&
    requireIdentifier(control['group'], `${path}.group`, report) &&
    !GROUPS.has(control['group'])
  ) {
    report.warning(
      'CONTROL_GROUP_UNKNOWN',
      `${path}.group`,
      'Unknown control group is presented in Advanced.'
    );
  }
  if (
    control['order'] !== undefined &&
    (typeof control['order'] !== 'number' ||
      !Number.isSafeInteger(control['order']) ||
      control['order'] < 0)
  ) {
    report.error('CONTROL_ORDER', `${path}.order`, 'Expected a non-negative safe integer.');
  }
  const localizedDefault = control['localizedDefaultValue'];
  if (localizedDefault !== undefined) {
    if (control['kind'] !== 'text')
      report.error(
        'CONTROL_LOCALIZED_DEFAULT_KIND',
        `${path}.localizedDefaultValue`,
        'Localized defaults require a text control.'
      );
    validateLocaleText(localizedDefault, `${path}.localizedDefaultValue`, false, report);
  }
  const options = control['options'];
  if (options === undefined) return;
  if (
    !Array.isArray(options) ||
    options.length < 2 ||
    options.length > 64 ||
    control['kind'] === 'color'
  ) {
    report.error(
      'CONTROL_OPTIONS',
      `${path}.options`,
      'Expected 2–64 options for a number or text control.'
    );
    return;
  }
  const values = new Set<number | string>();
  options.forEach((option, index) => {
    const optionPath = `${path}.options[${index}]`;
    if (!isRecord(option)) {
      report.error('CONTROL_OPTION', optionPath, 'Expected a value and localized label.');
      return;
    }
    rejectUnknownKeys(option, OPTION_KEYS, optionPath, report);
    validateLocaleText(option['label'], `${optionPath}.label`, false, report);
    const value = option['value'];
    const valid =
      control['kind'] === 'number'
        ? typeof value === 'number' &&
          Number.isFinite(value) &&
          (typeof control['min'] !== 'number' || value >= control['min']) &&
          (typeof control['max'] !== 'number' || value <= control['max'])
        : typeof value === 'string';
    if (!valid || (typeof value !== 'number' && typeof value !== 'string')) {
      report.error(
        'CONTROL_OPTION_VALUE',
        `${optionPath}.value`,
        'Option must match the control type and range.'
      );
      return;
    }
    if (values.has(value))
      report.error(
        'CONTROL_OPTION_DUPLICATE',
        `${optionPath}.value`,
        'Option values must be unique.'
      );
    values.add(value);
  });
  if (control['kind'] === 'text' && isRecord(localizedDefault)) {
    for (const [locale, text] of Object.entries(localizedDefault)) {
      if (typeof text === 'string' && text.trim() && !values.has(text))
        report.error(
          'CONTROL_OPTION_LOCALIZED_DEFAULT',
          `${path}.localizedDefaultValue.${locale}`,
          'Localized default must be one of the options.'
        );
    }
  }
  if (!values.has(control['defaultValue'] as number | string))
    report.error(
      'CONTROL_OPTION_DEFAULT',
      `${path}.defaultValue`,
      'Default value must be one of the options.'
    );
}
