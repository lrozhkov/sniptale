import type { AIModel } from '../../../contracts/settings';
import type { AICatalogFacts } from '../../../contracts/settings/ai-catalog';

const DAY_MS = 24 * 60 * 60 * 1000;
const ABSENT_RETENTION_MS = 30 * DAY_MS;

export interface CatalogModelObservation {
  modelCode: string;
  facts: AICatalogFacts;
}
interface CatalogReconciliationInput {
  providerId: string;
  scope: string;
  models: readonly AIModel[];
  observations: readonly CatalogModelObservation[];
  complete: boolean;
  now: number;
  referencedModelIds: ReadonlySet<string>;
  createId(): string;
}
interface CatalogReconciliation {
  models: AIModel[];
  added: number;
  updated: number;
  deleted: number;
}

function sameFacts(left: AICatalogFacts | undefined, right: AICatalogFacts): boolean {
  if (!left) return false;
  const { observedAt: _leftTime, ...leftFacts } = left;
  const { observedAt: _rightTime, ...rightFacts } = right;
  return JSON.stringify(leftFacts) === JSON.stringify(rightFacts);
}

function followsCatalogProperties(model: AIModel): boolean {
  return (
    model.propertySource === 'catalog' ||
    (model.propertySource === undefined && model.source === 'catalog')
  );
}

function reconcilePresent(model: AIModel, facts: AICatalogFacts): AIModel {
  if (sameFacts(model.catalog, facts)) return model;
  return {
    ...model,
    ...(followsCatalogProperties(model)
      ? { displayName: facts.displayName, capabilities: facts.capabilities }
      : {}),
    catalog: facts,
  };
}

function reconcileAbsent(model: AIModel, input: CatalogReconciliationInput): AIModel | null {
  if (!input.complete || !model.catalog) return model;
  if (model.catalog.scope !== input.scope) {
    const {
      firstAbsentAt: _first,
      lastAbsentAt: _last,
      absenceCount: _count,
      ...previous
    } = model.catalog;
    return {
      ...model,
      ...(followsCatalogProperties(model)
        ? { capabilities: { operations: {}, input: {}, output: {}, features: {} } }
        : {}),
      catalog: { ...previous, scope: input.scope, lifecycle: 'unknown' },
    };
  }
  const previous = model.catalog;
  const firstAbsentAt = previous?.firstAbsentAt ?? input.now;
  const lastAbsentAt = previous?.lastAbsentAt;
  const increments = lastAbsentAt === undefined || input.now - lastAbsentAt >= DAY_MS;
  const absenceCount = (previous?.absenceCount ?? 0) + (increments ? 1 : 0);
  if (
    model.source === 'catalog' &&
    followsCatalogProperties(model) &&
    absenceCount >= 2 &&
    input.now - firstAbsentAt >= ABSENT_RETENTION_MS &&
    !input.referencedModelIds.has(model.id)
  )
    return null;
  const catalog: AICatalogFacts = {
    ...model.catalog,
    scope: input.scope,
    lifecycle: model.catalog.lifecycle === 'retired' ? 'retired' : 'absent',
    firstAbsentAt,
    lastAbsentAt: increments ? input.now : (lastAbsentAt ?? input.now),
    absenceCount,
  };
  return sameFacts(model.catalog, catalog) ? model : { ...model, catalog };
}

/** Computes a semantic diff. The serialized settings owner must check the admission revision before committing it. */
export function reconcileManagedCatalog(input: CatalogReconciliationInput): CatalogReconciliation {
  const observedModels = new Map(
    input.observations.map((observation) => [observation.modelCode, observation.facts])
  );
  const pending = new Map(observedModels);
  const result: CatalogReconciliation = { models: [], added: 0, updated: 0, deleted: 0 };
  for (const model of input.models) {
    if (model.providerId !== input.providerId) {
      result.models.push(model);
      continue;
    }
    const observed = observedModels.get(model.modelCode);
    pending.delete(model.modelCode);
    const next = observed
      ? reconcilePresent(model, { ...observed, scope: input.scope })
      : reconcileAbsent(model, input);
    if (!next) result.deleted += 1;
    else {
      result.models.push(next);
      if (next !== model) result.updated += 1;
    }
  }
  for (const [modelCode, observation] of pending) {
    result.models.push({
      id: input.createId(),
      providerId: input.providerId,
      modelCode,
      displayName: observation.displayName,
      source: 'catalog',
      enabled: true,
      capabilities: observation.capabilities,
      catalog: { ...observation, scope: input.scope },
    });
    result.added += 1;
  }
  return result;
}
