import {
  EFFECT_V1_CONTROL_GROUP_LIMIT,
  EFFECT_V1_CONTROL_GROUP_DEPTH,
  EFFECT_V1_CONTROL_ICONS,
  isEffectV1SemanticControlGroup,
} from '../model/control-presentation.js';
import { isRecord, rejectUnknownKeys, requireIdentifier, validateLocaleText } from './shared.js';
import type { EffectV1DiagnosticReporter as EffectV1ValidationErrorReport } from './shared.js';

const GROUP_KEYS = new Set(['id', 'label', 'parentId', 'order', 'icon', 'collapsed']);

export function validateEffectV1ControlIcon(
  value: unknown,
  path: string,
  report: EffectV1ValidationErrorReport
): void {
  if (value !== undefined && !EFFECT_V1_CONTROL_ICONS.some((icon) => icon === value)) {
    report.error('CONTROL_ICON', path, 'Expected a semantic icon from the control icon registry.');
  }
}

export function validateEffectV1ControlGroups(
  value: unknown,
  report: EffectV1ValidationErrorReport
): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > EFFECT_V1_CONTROL_GROUP_LIMIT) {
    report.error('CONTROL_GROUPS', '$.controlGroups', 'Expected at most 64 custom control groups.');
    return;
  }
  const groups: unknown[] = value;
  const parents = new Map<string, string>();
  for (const [index, group] of groups.entries())
    validateControlGroupDeclaration(group, index, parents, report);
  validateControlGroupParents(groups, parents, report);
}

function validateControlGroupDeclaration(
  group: unknown,
  index: number,
  parents: Map<string, string>,
  report: EffectV1ValidationErrorReport
): void {
  const path = `$.controlGroups[${index}]`;
  if (!isRecord(group)) {
    report.error('CONTROL_GROUP', path, 'Expected a custom control group object.');
    return;
  }
  rejectUnknownKeys(group, GROUP_KEYS, path, report);
  const id = group['id'];
  const parentId = group['parentId'];
  const validId = requireIdentifier(id, `${path}.id`, report);
  const validParent = requireIdentifier(parentId, `${path}.parentId`, report);
  if (validId) {
    if (isEffectV1SemanticControlGroup(id)) {
      report.error(
        'CONTROL_GROUP_RESERVED',
        `${path}.id`,
        'Semantic root group IDs cannot be redeclared.'
      );
    } else if (parents.has(id)) {
      report.error(
        'CONTROL_GROUP_DUPLICATE',
        `${path}.id`,
        'Custom control group IDs must be unique.'
      );
    } else if (validParent) parents.set(id, parentId);
  }
  validateLocaleText(group['label'], `${path}.label`, false, report);
  if (
    group['order'] !== undefined &&
    (typeof group['order'] !== 'number' ||
      !Number.isSafeInteger(group['order']) ||
      group['order'] < 0)
  ) {
    report.error('CONTROL_ORDER', `${path}.order`, 'Expected a non-negative safe integer.');
  }
  if (group['collapsed'] !== undefined && typeof group['collapsed'] !== 'boolean') {
    report.error(
      'CONTROL_GROUP_COLLAPSED',
      `${path}.collapsed`,
      'Expected a boolean collapsed state.'
    );
  }
  validateEffectV1ControlIcon(group['icon'], `${path}.icon`, report);
}

function validateControlGroupParents(
  groups: unknown[],
  parents: ReadonlyMap<string, string>,
  report: EffectV1ValidationErrorReport
): void {
  for (const [index, group] of groups.entries()) {
    if (!isRecord(group) || typeof group['id'] !== 'string' || !parents.has(group['id'])) continue;
    let current = group['id'];
    const seen = new Set<string>();
    for (let depth = 1; ; depth += 1) {
      if (isEffectV1SemanticControlGroup(current)) {
        if (depth > EFFECT_V1_CONTROL_GROUP_DEPTH) {
          report.error(
            'CONTROL_GROUP_DEPTH',
            `$.controlGroups[${index}].parentId`,
            'Control group hierarchy must have at most four levels including the semantic root.'
          );
        }
        break;
      }
      const path = `$.controlGroups[${index}].parentId`;
      if (seen.has(current)) {
        report.error('CONTROL_GROUP_CYCLE', path, 'Control group parents must not form a cycle.');
        break;
      }
      seen.add(current);
      const parent = parents.get(current);
      if (parent === undefined) {
        report.error(
          'CONTROL_GROUP_PARENT',
          path,
          'Parent must reference a semantic root or declared custom group.'
        );
        break;
      }
      current = parent;
    }
  }
}
