import { validatePathSegments, validatePoints } from './paths.js';
import { validateFilter, validatePaint, validateShadow } from './values.js';
import { validateCommandBounds, validateCommandFields } from './fields.js';
import {
  type EffectV1DiagnosticReporter,
  type EffectV1Record,
  isRecord,
} from '../validation/shared.js';

export type EffectV1PassIndex = {
  duplicateIds: Set<string>;
  ids: Set<string>;
};

export function collectEffectV1PassIndex(commands: unknown[]): EffectV1PassIndex {
  const ids = new Set<string>();
  const duplicateIds = new Set<string>();
  walkCommands(commands, (command) => {
    if (command['op'] !== 'renderPass' || typeof command['id'] !== 'string') return;
    if (ids.has(command['id'])) duplicateIds.add(command['id']);
    ids.add(command['id']);
  });
  return { duplicateIds, ids };
}

export function validateEffectV1CommandSemantics(
  command: EffectV1Record,
  path: string,
  passes: EffectV1PassIndex,
  report: EffectV1DiagnosticReporter
): void {
  validateCommandFields(command, path, report);
  validateCommandBounds(command, path, report);
  if (!validateCommandCollections(command, path, report)) return;
  validateCommandGeometry(command, path, report);
  validateCommandAppearance(command, path, report);
  validateCommandPass(command, path, passes, report);
}

function validateCommandCollections(
  command: EffectV1Record,
  path: string,
  report: EffectV1DiagnosticReporter
): boolean {
  if (command['commands'] !== undefined) {
    if (!Array.isArray(command['commands'])) return false;
    if (command['commands'].length === 0) {
      report.error(
        'COMMANDS_EMPTY',
        `${path}.commands`,
        `Command "${command['op']}" must contain at least one child command.`
      );
    }
  }
  if (command['items'] !== undefined) {
    if (!Array.isArray(command['items'])) {
      report.error('COMMAND_ITEMS_TYPE', `${path}.items`, 'Expected an array.');
    } else if (command['items'].length === 0) {
      report.error(
        'COMMAND_ITEMS_EMPTY',
        `${path}.items`,
        `Command "${command['op']}" requires at least one item.`
      );
    }
  }
  if (command['bindings'] !== undefined) {
    if (!isRecord(command['bindings'])) {
      report.error(
        'COMMAND_BINDINGS_TYPE',
        `${path}.bindings`,
        'Expected a named expression object.'
      );
    } else if (Object.keys(command['bindings']).length === 0) {
      report.error(
        'COMMAND_BINDINGS_EMPTY',
        `${path}.bindings`,
        'Let requires at least one binding.'
      );
    }
  }
  return true;
}

function validateCommandGeometry(
  command: EffectV1Record,
  path: string,
  report: EffectV1DiagnosticReporter
): void {
  if (command['points'] !== undefined) {
    validatePoints(command['points'], `${path}.points`, report);
  }
  if (command['segments'] !== undefined) {
    validatePathSegments(command['segments'], `${path}.segments`, report);
  }
  if (command['op'] === 'path') {
    const sourceCount =
      Number(command['points'] !== undefined) + Number(command['segments'] !== undefined);
    if (sourceCount !== 1) {
      report.error(
        'COMMAND_PATH_SOURCE',
        path,
        'Path requires exactly one of points or segments.',
        'Use points for a polygon or segments for curves and arcs.'
      );
    }
  }
}

function validateCommandAppearance(
  command: EffectV1Record,
  path: string,
  report: EffectV1DiagnosticReporter
): void {
  for (const field of ['color', 'fill', 'stroke']) {
    if (command[field] !== undefined) {
      validatePaint(command[field], `${path}.${field}`, report);
    }
  }
  if (command['filter'] !== undefined) {
    validateFilter(command['filter'], `${path}.filter`, report);
  }
  if (command['shadow'] !== undefined) {
    validateShadow(command['shadow'], `${path}.shadow`, report);
  }
}

function validateCommandPass(
  command: EffectV1Record,
  path: string,
  passes: EffectV1PassIndex,
  report: EffectV1DiagnosticReporter
): void {
  if (command['op'] === 'renderPass' && typeof command['id'] === 'string') {
    if (passes.duplicateIds.has(command['id'])) {
      report.error(
        'RENDER_PASS_DUPLICATE',
        `${path}.id`,
        `Render pass "${command['id']}" is declared more than once.`
      );
    }
  }
  if (command['op'] === 'compositePass' && typeof command['passId'] === 'string') {
    if (!passes.ids.has(command['passId'])) {
      report.error(
        'RENDER_PASS_UNKNOWN',
        `${path}.passId`,
        `Render pass "${command['passId']}" is not declared.`,
        'Add one renderPass command with this id or correct the reference.'
      );
    }
  }
}

function walkCommands(commands: unknown[], visit: (command: EffectV1Record) => void): void {
  for (const value of commands) {
    if (!isRecord(value)) continue;
    visit(value);
    if (Array.isArray(value['commands'])) walkCommands(value['commands'], visit);
  }
}
