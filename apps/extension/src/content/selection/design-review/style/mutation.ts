import type {
  PagePreparationHistoryDomEffect,
  PagePreparationHistoryDomEffectResult,
} from '../../../parser/page-preparation/history';
import type {
  CssDeclarationDelta,
  CssDeclarationPolicy,
  CssDeclarationRequest,
  CssDeclarationValue,
  PageStyleMutationBatch,
  PageStyleMutationElement,
  PageStyleMutationInput,
  PageStyleMutationResult,
} from './types';
import { isPageStyleMutationElement } from './element';
import {
  beginOwnerDeclarationMutation,
  cloneDeclarationPolicy,
  completeOwnerDeclarationMutation,
  invalidatePageOwnedDeclarationPolicies,
  readDeclarationPolicy,
  rememberDeclarationPolicies,
} from './provenance';
import { isCssDeclarationValueAllowed, validateCssDeclaration } from './validation';

type PageStyleMutationBatchApplyResult = PagePreparationHistoryDomEffectResult & {
  recoveryBatch?: PageStyleMutationBatch;
};

function declarationValuesEqual(left: CssDeclarationValue, right: CssDeclarationValue): boolean {
  return left.priority === right.priority && left.value === right.value;
}

function readDeclarationValue(
  target: PageStyleMutationElement,
  property: CssDeclarationDelta['property']
): CssDeclarationValue {
  return {
    priority: target.style.getPropertyPriority(property) === 'important' ? 'important' : '',
    value: target.style.getPropertyValue(property),
  };
}

function createValidatedPolicy(args: {
  source: CssDeclarationPolicy['source'];
}): CssDeclarationPolicy {
  return { source: args.source };
}

function createDeclarationDeltas(
  target: PageStyleMutationElement,
  requests: CssDeclarationRequest[]
): PageStyleMutationResult | CssDeclarationDelta[] {
  invalidatePageOwnedDeclarationPolicies(target);
  const declarationsByProperty = new Map<CssDeclarationDelta['property'], CssDeclarationDelta>();

  for (const request of requests) {
    const validated = validateCssDeclaration(target, request);
    if (validated.status === 'invalid') {
      return {
        code: 'invalid-declaration',
        message: validated.message,
        status: 'failed',
      };
    }

    const before =
      declarationsByProperty.get(validated.property)?.before ??
      readDeclarationValue(target, validated.property);
    const beforePolicy =
      declarationsByProperty.get(validated.property)?.beforePolicy ??
      readDeclarationPolicy(target, validated.property, before);
    const after = { priority: validated.priority, value: validated.value };
    declarationsByProperty.delete(validated.property);
    if (!declarationValuesEqual(before, after)) {
      declarationsByProperty.set(validated.property, {
        after,
        afterPolicy: createValidatedPolicy(validated),
        before,
        beforePolicy,
        order: validated.order,
        property: validated.property,
      });
    }
  }

  return Array.from(declarationsByProperty.values()).sort(
    (left, right) => left.order - right.order || left.property.localeCompare(right.property)
  );
}

function batchHasChanges(batch: PageStyleMutationBatch): boolean {
  return batch.declarations.length > 0;
}

function readBatchMatches(
  batch: PageStyleMutationBatch,
  direction: 'undo' | 'redo',
  endpoint: 'source' | 'target'
): boolean {
  const readSide = endpoint === 'source' ? (direction === 'undo' ? 'after' : 'before') : direction;
  const declarationSide = readSide === 'undo' ? 'before' : readSide === 'redo' ? 'after' : readSide;
  return batch.declarations.every((delta) =>
    declarationValuesEqual(
      readDeclarationValue(batch.target, delta.property),
      delta[declarationSide]
    )
  );
}

function applyBatchUnchecked(batch: PageStyleMutationBatch, direction: 'undo' | 'redo'): void {
  const side = direction === 'undo' ? 'before' : 'after';
  batch.declarations.forEach((delta) => {
    const value = delta[side];
    if (declarationValuesEqual(readDeclarationValue(batch.target, delta.property), value)) {
      return;
    }
    const token = beginOwnerDeclarationMutation(batch.target);
    try {
      if (value.value === '') {
        batch.target.style.removeProperty(delta.property);
      } else {
        batch.target.style.setProperty(delta.property, value.value, value.priority);
      }
    } catch (error) {
      completeOwnerDeclarationMutation(token);
      throw error;
    }
    if (!completeOwnerDeclarationMutation(token)) {
      throw new Error('Page style target performed a reentrant declaration mutation');
    }
  });
}

function resolveCurrentPolicy(
  batch: PageStyleMutationBatch,
  delta: CssDeclarationDelta,
  value: CssDeclarationValue
): CssDeclarationPolicy {
  const endpointPolicy = declarationValuesEqual(delta.before, value)
    ? delta.beforePolicy
    : declarationValuesEqual(delta.after, value)
      ? delta.afterPolicy
      : null;
  return endpointPolicy
    ? cloneDeclarationPolicy(endpointPolicy)
    : readDeclarationPolicy(batch.target, delta.property, value);
}

function captureRecoveryBatch(
  batch: PageStyleMutationBatch,
  direction: 'undo' | 'redo'
): PageStyleMutationBatch {
  const sourceSide = direction === 'undo' ? 'after' : 'before';
  const declarations = batch.declarations.flatMap((delta) => {
    const after = readDeclarationValue(batch.target, delta.property);
    const before = delta[sourceSide];
    return declarationValuesEqual(before, after)
      ? []
      : [
          {
            ...delta,
            after,
            afterPolicy: resolveCurrentPolicy(batch, delta, after),
            before,
            beforePolicy: cloneDeclarationPolicy(
              sourceSide === 'before' ? delta.beforePolicy : delta.afterPolicy
            ),
          },
        ];
  });
  return {
    declarations,
    target: batch.target,
  };
}

export function capturePageStyleMutationResidual(
  batch: PageStyleMutationBatch,
  sourceSide: 'after' | 'before'
): PageStyleMutationBatch {
  return captureRecoveryBatch(batch, sourceSide === 'before' ? 'redo' : 'undo');
}

function validateDeclarationEndpoint(
  batch: PageStyleMutationBatch,
  delta: CssDeclarationDelta,
  side: 'after' | 'before'
): boolean {
  const policy = side === 'before' ? delta.beforePolicy : delta.afterPolicy;
  return isCssDeclarationValueAllowed({
    element: batch.target,
    property: delta.property,
    source: policy.source,
    value: delta[side],
  });
}

function validateBatchDeclarations(batch: PageStyleMutationBatch): boolean {
  return batch.declarations.every((delta) =>
    (['before', 'after'] as const).every((side) => validateDeclarationEndpoint(batch, delta, side))
  );
}

/** Applies an exact owner delta and restores the source endpoint if any write fails. */
export function applyPageStyleMutationBatch(
  batch: PageStyleMutationBatch,
  direction: 'undo' | 'redo'
): PageStyleMutationBatchApplyResult {
  if (!batch.target.isConnected) {
    return { failures: ['detached-target'], success: false };
  }
  invalidatePageOwnedDeclarationPolicies(batch.target);
  if (!validateBatchDeclarations(batch)) {
    return { failures: ['invalid-declaration'], success: false };
  }
  if (!readBatchMatches(batch, direction, 'source')) {
    return { failures: ['stale-target-state'], success: false };
  }

  try {
    applyBatchUnchecked(batch, direction);
    if (!readBatchMatches(batch, direction, 'target')) {
      throw new Error('CSSOM did not retain the requested declaration value');
    }
    rememberDeclarationPolicies(batch, direction === 'undo' ? 'before' : 'after');
    return { failures: [], success: true };
  } catch {
    try {
      applyBatchUnchecked(batch, direction === 'undo' ? 'redo' : 'undo');
    } catch {
      return {
        failures: ['mutation-failed', 'rollback-failed'],
        recoveryBatch: captureRecoveryBatch(batch, direction),
        success: false,
      };
    }
    if (!readBatchMatches(batch, direction, 'source')) {
      return {
        failures: ['mutation-failed', 'rollback-failed'],
        recoveryBatch: captureRecoveryBatch(batch, direction),
        success: false,
      };
    }
    rememberDeclarationPolicies(batch, direction === 'undo' ? 'after' : 'before');
    return { failures: ['mutation-failed'], success: false };
  }
}

/** Validates and atomically applies one page-style mutation command. */
export function applyPageStyleMutation(input: PageStyleMutationInput): PageStyleMutationResult {
  if (!isPageStyleMutationElement(input.target)) {
    return {
      code: 'detached-target',
      message: 'Page style target is detached',
      status: 'failed',
    };
  }

  const declarations = createDeclarationDeltas(input.target, input.declarations);
  if (!Array.isArray(declarations)) {
    return declarations;
  }
  const batch: PageStyleMutationBatch = {
    declarations,
    target: input.target,
  };
  if (!batchHasChanges(batch)) {
    return { batch, status: 'applied' };
  }

  const applyResult = applyPageStyleMutationBatch(batch, 'redo');
  if (applyResult.success) {
    return { batch, status: 'applied' };
  }

  const recoveryBatch = applyResult.failures.includes('rollback-failed')
    ? applyResult.recoveryBatch
    : null;
  return {
    code: applyResult.failures.includes('rollback-failed')
      ? 'rollback-failed'
      : applyResult.failures.includes('stale-target-state')
        ? 'stale-target-state'
        : applyResult.failures.includes('invalid-declaration')
          ? 'invalid-declaration'
          : 'mutation-failed',
    message: `Page style mutation failed: ${applyResult.failures.join(', ')}`,
    ...(recoveryBatch && batchHasChanges(recoveryBatch) ? { recoveryBatch } : {}),
    status: 'failed',
  };
}

function mergeDeclarationDeltas(
  current: CssDeclarationDelta[],
  next: CssDeclarationDelta[]
): CssDeclarationDelta[] {
  const merged = new Map(current.map((delta) => [delta.property, delta]));
  next.forEach((delta) => {
    const existing = merged.get(delta.property);
    const before = existing?.before ?? delta.before;
    merged.delete(delta.property);
    if (!declarationValuesEqual(before, delta.after)) {
      merged.set(delta.property, {
        ...delta,
        before,
        beforePolicy: existing?.beforePolicy ?? delta.beforePolicy,
      });
    }
  });
  return Array.from(merged.values()).sort(
    (left, right) => left.order - right.order || left.property.localeCompare(right.property)
  );
}

export function mergePageStyleMutationBatches(
  current: PageStyleMutationBatch | null,
  next: PageStyleMutationBatch
): PageStyleMutationBatch {
  if (!current) {
    return next;
  }
  if (current.target !== next.target) {
    throw new Error('Cannot merge page-style mutations for different targets');
  }

  return {
    declarations: mergeDeclarationDeltas(current.declarations, next.declarations),
    target: current.target,
  };
}

function applyPageStyleRecoveryBatch(
  batch: PageStyleMutationBatch
): PageStyleMutationBatchApplyResult {
  if (!batch.target.isConnected) {
    return { failures: ['detached-target'], success: false };
  }
  invalidatePageOwnedDeclarationPolicies(batch.target);
  if (!batch.declarations.every((delta) => validateDeclarationEndpoint(batch, delta, 'before'))) {
    return { failures: ['invalid-declaration'], success: false };
  }
  if (!readBatchMatches(batch, 'undo', 'source')) {
    return { failures: ['stale-target-state'], success: false };
  }

  try {
    applyBatchUnchecked(batch, 'undo');
  } catch {
    // The exact factual residual is captured below.
  }
  if (readBatchMatches(batch, 'undo', 'target')) {
    rememberDeclarationPolicies(batch, 'before');
    return { failures: [], success: true };
  }
  return {
    failures: ['recovery-failed'],
    recoveryBatch: captureRecoveryBatch(batch, 'undo'),
    success: false,
  };
}

function createRecoveryHistoryEffect(
  batch: PageStyleMutationBatch,
  onRecovery?: (recoveryBatch: PageStyleMutationBatch) => void
): PagePreparationHistoryDomEffect {
  const effect: PagePreparationHistoryDomEffect = {
    apply: (direction) => {
      if (direction !== 'undo') {
        return { failures: ['recovery-redo-disabled'], success: false };
      }
      const result = applyPageStyleRecoveryBatch(batch);
      if (!result.success && result.recoveryBatch && batchHasChanges(result.recoveryBatch)) {
        onRecovery?.(result.recoveryBatch);
        return {
          failures: result.failures,
          recovery: { effect: createRecoveryHistoryEffect(result.recoveryBatch, onRecovery) },
          success: false,
        };
      }
      return result;
    },
    hasChanges: batchHasChanges(batch),
    recoveryOnly: true,
  };
  return effect;
}

export function createPageStyleHistoryEffect(
  batch: PageStyleMutationBatch,
  options: {
    onRecovery?: (recoveryBatch: PageStyleMutationBatch) => void;
    recoveryOnly?: boolean;
  } = {}
): PagePreparationHistoryDomEffect {
  if (options.recoveryOnly) {
    return createRecoveryHistoryEffect(batch, options.onRecovery);
  }
  return {
    apply: (direction) => {
      const result = applyPageStyleMutationBatch(batch, direction);
      if (!result.success && result.recoveryBatch && batchHasChanges(result.recoveryBatch)) {
        options.onRecovery?.(result.recoveryBatch);
        return {
          failures: result.failures,
          recovery: {
            effect: createRecoveryHistoryEffect(result.recoveryBatch, options.onRecovery),
          },
          success: false,
        };
      }
      return result;
    },
    hasChanges: batchHasChanges(batch),
  };
}
