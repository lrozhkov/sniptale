import {
  EFFECT_V1_CONTROL_PRESENTATIONS,
  EFFECT_V1_CONTROL_UNITS,
} from '../model/control-presentation.js';
import { validateEffectV1ControlIcon } from './control-groups.js';
import type { EffectV1DiagnosticReporter as EffectV1ValidationErrorReport } from './shared.js';

export function validateEffectV1ControlMetadata(
  control: Record<string, unknown>,
  path: string,
  report: EffectV1ValidationErrorReport
): void {
  validateEffectV1ControlIcon(control['icon'], `${path}.icon`, report);
  if (
    control['unit'] !== undefined &&
    (control['kind'] !== 'number' ||
      !EFFECT_V1_CONTROL_UNITS.some((unit) => unit === control['unit']))
  ) {
    report.error(
      'CONTROL_UNIT',
      `${path}.unit`,
      'Units require a number control and a declared unit ID.'
    );
  }
  const presentation = control['presentation'];
  if (presentation === undefined || presentation === 'auto') return;
  if (!EFFECT_V1_CONTROL_PRESENTATIONS.some((item) => item === presentation)) {
    report.error(
      'CONTROL_PRESENTATION',
      `${path}.presentation`,
      'Expected a declared control presentation.'
    );
    return;
  }
  const options = control['options'];
  if (presentation === 'dropdown' || presentation === 'segmented' || presentation === 'toggle') {
    if (
      (control['kind'] !== 'number' && control['kind'] !== 'text') ||
      !Array.isArray(options) ||
      options.length < 2 ||
      options.length > (presentation === 'segmented' ? 8 : presentation === 'toggle' ? 2 : 64)
    ) {
      report.error(
        'CONTROL_PRESENTATION_OPTIONS',
        `${path}.presentation`,
        'Option presentations require matching number/text options within their size limits.'
      );
    }
    return;
  }
  const expected =
    presentation === 'slider' || presentation === 'number'
      ? 'number'
      : presentation === 'color'
        ? 'color'
        : 'text';
  if (control['kind'] !== expected) {
    report.error(
      'CONTROL_PRESENTATION_KIND',
      `${path}.presentation`,
      'Presentation does not match the control kind.'
    );
  }
  if (options !== undefined) {
    report.error(
      'CONTROL_PRESENTATION_OPTIONS',
      `${path}.presentation`,
      'Non-option presentations cannot declare options.'
    );
  }
}
