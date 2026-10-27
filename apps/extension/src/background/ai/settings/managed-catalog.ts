import type { AIProvider } from '../../../contracts/settings';
import {
  getAIProviderDefinition,
  type AICatalogProtocol,
} from '../../../contracts/settings/ai-provider';
import type { AIConnectionReason } from '../../../contracts/settings/ai-catalog';
import type {
  AICatalogRefreshAdmission,
  AICatalogRefreshOutcome,
  AICatalogRefreshToken,
} from '../../../composition/persistence/ai-settings/managed-catalog';
import { createProviderSdkFetch } from '../llm/transport/http';
import {
  AIProviderRequestError,
  classifyAIProviderFailure,
  classifyAIProviderHttpStatus,
} from '../providers';
import {
  parseAICatalogPage,
  mergeConflictingCatalogModels,
  type ParsedCatalogPage,
  type ParsedCatalogModel,
} from './catalog-parser';

const MAX_CATALOG_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
const MAX_PAGES = 50;
const MAX_MODELS = 10000;

function catalogBaseUrl(provider: AIProvider): string {
  const base = provider.baseUrl.replace(/\/+$/u, '');
  return provider.connectionType === 'cohere' ? base.replace(/\/v2$/u, '/v1') : base;
}
function catalogUrl(base: string, protocol: AICatalogProtocol, cursor?: string): URL {
  const endpoint =
    protocol === 'ollama' ? 'tags' : protocol === 'openrouter' ? 'models/user' : 'models';
  const url = new URL(`${base}/${endpoint}`);
  if (cursor) {
    const parameter =
      protocol === 'google' ? 'pageToken' : protocol === 'anthropic' ? 'after_id' : 'page_token';
    url.searchParams.set(parameter, cursor);
  }
  return url;
}
function catalogHttpFailure(status: number): AIConnectionReason {
  if (status === 401 || status === 498) return 'invalid-credential';
  if (status === 403) return 'permission-denied';
  if (status === 402) return 'quota-exceeded';
  if (status === 404 || status === 405 || status === 501) return 'catalog-unsupported';
  if (status === 429) return 'rate-limited';
  if (status >= 500) return 'service-error';
  return 'unknown';
}

interface ReadProviderCatalogOptions {
  provider: AIProvider;
  apiKey: string;
  now: number;
  beforeSend(): Promise<void>;
  signal?: AbortSignal;
  transport?: typeof globalThis.fetch;
}

/** Fetch only bounded metadata pages at the admitted origin. This function never performs inference. */
export async function readProviderCatalog(
  options: ReadProviderCatalogOptions
): Promise<ParsedCatalogPage> {
  const definition = getAIProviderDefinition(options.provider.connectionType);
  if (!definition.available || definition.catalog === 'none')
    throw new AIProviderRequestError('catalog-unsupported');
  const baseUrl = catalogBaseUrl(options.provider);
  const deadline = AbortSignal.timeout(30000);
  const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
  const jsonRequest = createCatalogReader(options, baseUrl, definition.catalog, signal);
  try {
    return await collectCatalogPages(baseUrl, definition.catalog, options.now, jsonRequest);
  } catch (error) {
    if (options.signal?.aborted) throw options.signal.reason;
    throw new AIProviderRequestError(
      deadline.aborted ? 'timeout' : classifyAIProviderFailure(error)
    );
  }
}

function createCatalogReader(
  options: ReadProviderCatalogOptions,
  baseUrl: string,
  protocol: AICatalogProtocol,
  signal: AbortSignal
) {
  const fetch = createProviderSdkFetch({
    baseUrl,
    maxResponseBytes: MAX_CATALOG_BYTES,
    signal,
    beforeSend: options.beforeSend,
    ...(options.transport ? { transport: options.transport } : {}),
  });
  const headers = new Headers({ Accept: 'application/json' });
  if (protocol === 'anthropic') {
    headers.set('x-api-key', options.apiKey);
    headers.set('anthropic-version', '2023-06-01');
  } else if (protocol === 'google') headers.set('x-goog-api-key', options.apiKey);
  else if (protocol === 'elevenlabs') headers.set('xi-api-key', options.apiKey);
  else if (options.apiKey) headers.set('Authorization', `Bearer ${options.apiKey}`);
  let totalBytes = 0;
  return async (url: string | URL, body?: object): Promise<unknown> => {
    if (body) headers.set('Content-Type', 'application/json');
    else headers.delete('Content-Type');
    const response = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok && response.status !== 429)
      throw new AIProviderRequestError(catalogHttpFailure(response.status));
    const bytes = await response.arrayBuffer();
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_TOTAL_BYTES) throw new AIProviderRequestError('unknown');
    let value: unknown;
    try {
      value = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new AIProviderRequestError(
        response.ok ? 'unknown' : catalogHttpFailure(response.status)
      );
    }
    if (!response.ok)
      throw new AIProviderRequestError(classifyAIProviderHttpStatus(response.status, value));
    return value;
  };
}

type CatalogReader = ReturnType<typeof createCatalogReader>;

async function collectCatalogPages(
  baseUrl: string,
  protocol: AICatalogProtocol,
  now: number,
  jsonRequest: CatalogReader
): Promise<ParsedCatalogPage> {
  const models = new Map<string, ParsedCatalogModel>();
  const cursors = new Set<string>();
  let cursor: string | undefined;
  let complete = true;
  for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
    const page = parseAICatalogPage(
      await jsonRequest(catalogUrl(baseUrl, protocol, cursor)),
      protocol,
      now
    );
    complete &&= page.complete;
    for (let model of page.models) {
      model = await enrichCatalogModel(model, baseUrl, protocol, now, jsonRequest);
      const previous = models.get(model.modelCode);
      if (previous && JSON.stringify(previous.facts) !== JSON.stringify(model.facts)) {
        complete = false;
        models.set(model.modelCode, mergeConflictingCatalogModels(previous, model));
      } else models.set(model.modelCode, model);
      if (models.size > MAX_MODELS) throw new AIProviderRequestError('unknown');
    }
    cursor = page.nextCursor;
    if (!cursor) return { models: [...models.values()], complete };
    if (cursors.has(cursor)) return { models: [...models.values()], complete: false };
    cursors.add(cursor);
  }
  return { models: [...models.values()], complete: false };
}

async function enrichCatalogModel(
  model: ParsedCatalogModel,
  baseUrl: string,
  protocol: AICatalogProtocol,
  now: number,
  jsonRequest: CatalogReader
): Promise<ParsedCatalogModel> {
  if (
    protocol !== 'ollama' ||
    model.facts.lifecycle === 'unknown' ||
    model.facts.lifecycle === 'retired'
  )
    return model;
  const details = await jsonRequest(`${baseUrl}/show`, { model: model.modelCode });
  if (typeof details !== 'object' || details === null || Array.isArray(details)) return model;
  const enriched = parseAICatalogPage(
    { models: [{ ...details, name: model.modelCode }] },
    'ollama',
    now
  ).models[0];
  if (!enriched) return model;
  const retirementDates = [model.facts.retirementAt, enriched.facts.retirementAt].filter(
    (value): value is number => value !== undefined
  );
  const retirementAt = retirementDates.length ? Math.min(...retirementDates) : undefined;
  return {
    ...enriched,
    facts: {
      ...enriched.facts,
      lifecycle:
        enriched.facts.lifecycle === 'retired' ||
        (retirementAt !== undefined && retirementAt <= now)
          ? 'retired'
          : model.facts.lifecycle === 'deprecated'
            ? 'deprecated'
            : enriched.facts.lifecycle,
      ...(retirementAt === undefined ? {} : { retirementAt }),
    },
  };
}

interface ManagedCatalogDependencies {
  readProviders(): Promise<AIProvider[]>;
  admit(providerId: string, explicit: boolean): Promise<AICatalogRefreshAdmission | null>;
  prepare(admission: AICatalogRefreshAdmission): Promise<string>;
  beforeSend(admission: AICatalogRefreshAdmission): Promise<void>;
  commit(token: AICatalogRefreshToken, outcome: AICatalogRefreshOutcome): Promise<boolean>;
  read?: typeof readProviderCatalog;
  now?(): number;
}

/** Coalesces metadata work per connection incarnation and configuration. The storage owner orders commits. */
export function createManagedCatalogService(dependencies: ManagedCatalogDependencies) {
  const flights = new Map<string, Promise<boolean>>();
  return {
    async refresh(providerId: string, explicit = false): Promise<boolean> {
      const provider = (await dependencies.readProviders()).find(
        (entry) => entry.id === providerId
      );
      if (!provider) return false;
      const key = JSON.stringify([
        provider.id,
        provider.incarnation,
        provider.revision,
        provider.credentialRevision,
      ]);
      const current = flights.get(key);
      if (current) return current;
      const work = (async () => {
        const admission = await dependencies.admit(providerId, explicit);
        if (!admission) return false;
        let outcome: AICatalogRefreshOutcome;
        try {
          const apiKey = await dependencies.prepare(admission);
          const page = await (dependencies.read ?? readProviderCatalog)({
            provider: admission.provider,
            apiKey,
            now: dependencies.now?.() ?? Date.now(),
            beforeSend: () => dependencies.beforeSend(admission),
          });
          outcome = { kind: 'catalog', models: page.models, complete: page.complete };
        } catch (error) {
          const reason = classifyAIProviderFailure(error);
          outcome = {
            kind: 'failure',
            reason,
            ...(reason === 'secret-locked'
              ? { status: 'locked' }
              : reason === 'host-permission-required'
                ? { status: 'permission-required' }
                : reason === 'catalog-unsupported'
                  ? { status: 'unverified' }
                  : {}),
          };
        }
        return dependencies.commit(admission.token, outcome);
      })();
      flights.set(key, work);
      try {
        return await work;
      } finally {
        if (flights.get(key) === work) flights.delete(key);
      }
    },
  };
}
