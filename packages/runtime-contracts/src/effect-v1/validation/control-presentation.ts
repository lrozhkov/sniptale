import { resolveEffectV1ControlGroup } from '../model/control-presentation.js';
import { validateEffectV1ControlIcon } from './control-groups.js';
import { validateEffectV1ControlMetadata } from './control-metadata.js';
import { isRecord, rejectUnknownKeys, requireIdentifier, validateLocaleText } from './shared.js';

const OPTION_KEYS = new Set(['value', 'label', 'icon']);

export function validateControlPresentation(
  control: Record<string, unknown>,
  path: string,
  report: {
    error(code: string, path: string, message: string): void;
    warning(code: string, path: string, message: string): void;
  },
  controlGroups?: unknown
): void {
  if (
    control['group'] !== undefined &&
    requireIdentifier(control['group'], `${path}.group`, report) &&
    resolveEffectV1ControlGroup(control['group'], controlGroups) === null
  ) {
    if (controlGroups === undefined) {
      report.warning(
        'CONTROL_GROUP_UNKNOWN',
        `${path}.group`,
        'Unknown control group is presented in Advanced.'
      );
    } else {
      report.error(
        'CONTROL_GROUP_REFERENCE',
        `${path}.group`,
        'Control group must reference a semantic root or declared custom group.'
      );
    }
  }
  if (
    control['order'] !== undefined &&
    (typeof control['order'] !== 'number' ||
      !Number.isSafeInteger(control['order']) ||
      control['order'] < 0)
  ) {
    report.error('CONTROL_ORDER', `${path}.order`, 'Expected a non-negative safe integer.');
  }
  validateEffectV1ControlMetadata(control, path, report);
  const localizedDefault = control['localizedDefaultValue'];
  if (localizedDefault !== undefined) {
    if (control['kind'] !== 'text') {
      report.error(
        'CONTROL_LOCALIZED_DEFAULT_KIND',
        `${path}.localizedDefaultValue`,
        'Localized defaults are only valid for text controls.'
      );
    }
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
    validateEffectV1ControlIcon(option['icon'], `${optionPath}.icon`, report);
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
  if (isRecord(localizedDefault)) {
    for (const [locale, value] of Object.entries(localizedDefault)) {
      if (typeof value === 'string' && value.trim() && !values.has(value)) {
        report.error(
          'CONTROL_OPTION_LOCALIZED_DEFAULT',
          `${path}.localizedDefaultValue.${locale}`,
          'Localized default must be one of the options.'
        );
      }
    }
  }
  if (!values.has(control['defaultValue'] as number | string))
    report.error(
      'CONTROL_OPTION_DEFAULT',
      `${path}.defaultValue`,
      'Default value must be one of the options.'
    );
}
