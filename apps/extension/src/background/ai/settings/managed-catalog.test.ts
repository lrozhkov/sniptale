import { describe, expect, it, vi } from 'vitest';
import { reconcileManagedCatalog } from '../../../composition/persistence/ai-settings/catalog-reconciliation';
import { supportsAIModelOperation } from '../../../contracts/settings/model-operation';
import type { AIProvider } from '../../../contracts/settings';
import {
  getAIProviderDefinition,
  type AIProviderType,
} from '../../../contracts/settings/ai-provider';
import type { AICatalogRefreshAdmission } from '../../../composition/persistence/ai-settings/managed-catalog';
import { AIProviderRequestError } from '../providers';
import { createManagedCatalogService, readProviderCatalog } from './managed-catalog';

function provider(type: AIProviderType = 'neuraldeep'): AIProvider {
  return {
    id: 'provider',
    name: 'Connection',
    connectionType: type,
    baseUrl: getAIProviderDefinition(type).baseUrl,
    createdAt: 1,
    hasStoredApiKey: true,
    incarnation: 'incarnation',
    revision: 1,
    credentialRevision: 1,
  };
}
function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('bounded provider catalog transport', () => {
  it('reads NeuralDeep metadata without inference, redirects, cookies, or retries', async () => {
    const beforeSend = vi.fn(async () => undefined);
    const transport = vi.fn(async (_input, init) => {
      expect(beforeSend).toHaveBeenCalledOnce();
      expect(init).toMatchObject({
        method: 'GET',
        redirect: 'error',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
      });
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer fixture-secret');
      return json({ data: [{ id: 'model/exact:tag', type: 'chat' }] });
    });
    const page = await readProviderCatalog({
      provider: provider(),
      apiKey: 'fixture-secret',
      now: 1000,
      beforeSend,
      transport,
    });
    expect(page.complete).toBe(true);
    expect(page.models[0]?.modelCode).toBe('model/exact:tag');
    expect(transport).toHaveBeenCalledOnce();
    expect(transport.mock.calls[0]?.[0].toString()).toBe('https://api.neuraldeep.ru/v1/models');
  });

  it('uses native Anthropic authentication and reads every cursor page', async () => {
    const beforeSend = vi.fn(async () => undefined);
    const transport = vi
      .fn()
      .mockResolvedValueOnce(
        json({ data: [{ id: 'first', type: 'model' }], has_more: true, last_id: 'cursor/special+' })
      )
      .mockResolvedValueOnce(json({ data: [{ id: 'second', type: 'model' }], has_more: false }));
    const result = await readProviderCatalog({
      provider: provider('anthropic'),
      apiKey: 'fixture-secret',
      now: 1,
      beforeSend,
      transport,
    });
    expect(result.models.map((model) => model.modelCode)).toEqual(['first', 'second']);
    expect(beforeSend).toHaveBeenCalledTimes(2);
    const [url, init] = transport.mock.calls[1]!;
    expect(new URL(url).searchParams.get('after_id')).toBe('cursor/special+');
    expect(new Headers(init.headers).get('x-api-key')).toBe('fixture-secret');
    expect(new Headers(init.headers).get('Authorization')).toBeNull();
  });

  it('uses a Google header instead of putting the key in pagination URLs', async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          models: [{ name: 'models/first', supportedGenerationMethods: ['generateContent'] }],
          nextPageToken: 'next',
        })
      )
      .mockResolvedValueOnce(json({ models: [] }));
    await readProviderCatalog({
      provider: provider('google'),
      apiKey: 'fixture-secret',
      now: 1,
      beforeSend: async () => undefined,
      transport,
    });
    const [url, init] = transport.mock.calls[1]!;
    expect(new URL(url).searchParams.get('pageToken')).toBe('next');
    expect(new URL(url).searchParams.has('key')).toBe(false);
    expect(new Headers(init.headers).get('x-goog-api-key')).toBe('fixture-secret');
  });

  it('uses the documented Cohere metadata version and preserves the configured origin', async () => {
    const transport = vi
      .fn()
      .mockResolvedValue(json({ models: [{ name: 'exact-model', endpoints: ['chat'] }] }));
    const result = await readProviderCatalog({
      provider: provider('cohere'),
      apiKey: 'fixture-secret',
      now: 1,
      beforeSend: async () => undefined,
      transport,
    });
    expect(transport.mock.calls[0]?.[0].toString()).toBe('https://api.cohere.com/v1/models');
    expect(result.models[0]?.facts.capabilities.operations.text).toBe('supported');
  });

  it('uses user-filtered OpenRouter models without public fallback after denial', async () => {
    const transport = vi
      .fn()
      .mockResolvedValue(json({ error: { message: 'unsafe-server-detail fixture-secret' } }, 401));
    const result = readProviderCatalog({
      provider: provider('openrouter'),
      apiKey: 'fixture-secret',
      now: 1,
      beforeSend: async () => undefined,
      transport,
    });
    await expect(result).rejects.toMatchObject({
      reason: 'invalid-credential',
      message: 'invalid-credential',
    });
    expect(transport).toHaveBeenCalledOnce();
    expect(transport.mock.calls[0]?.[0].toString()).toBe(
      'https://openrouter.ai/api/v1/models/user'
    );
  });

  it('reads Ollama capabilities with metadata-only show calls and no credential requirement', async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce(json({ models: [{ name: 'local:latest' }] }))
      .mockResolvedValueOnce(json({ capabilities: ['completion', 'vision'] }));
    const result = await readProviderCatalog({
      provider: provider('ollama'),
      apiKey: '',
      now: 1,
      beforeSend: async () => undefined,
      transport,
    });
    expect(result.models[0]?.facts.capabilities).toMatchObject({
      operations: { text: 'supported' },
      input: { image: 'supported' },
    });
    const [url, init] = transport.mock.calls[1]!;
    expect(url).toBe('http://localhost:11434/api/show');
    expect(JSON.parse(init.body)).toEqual({ model: 'local:latest' });
    expect(new Headers(init.headers).get('Authorization')).toBeNull();
  });

  it('marks cursor loops and conflicting page duplicates partial', async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          models: [{ name: 'models/m', supportedGenerationMethods: ['generateContent'] }],
          nextPageToken: 'loop',
        })
      )
      .mockResolvedValueOnce(
        json({
          models: [{ name: 'models/m', supportedGenerationMethods: [] }],
          nextPageToken: 'loop',
        })
      );
    const result = await readProviderCatalog({
      provider: provider('google'),
      apiKey: 'fixture-secret',
      now: 1,
      beforeSend: async () => undefined,
      transport,
    });
    expect(result.complete).toBe(false);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(result.models).toHaveLength(1);
  });

  it.each([
    [
      'redirect',
      () => new Response(null, { status: 302, headers: { Location: 'https://other.invalid' } }),
    ],
    ['oversize', () => new Response('x', { headers: { 'Content-Length': '9999999' } })],
    ['invalid-json', () => new Response('unsafe-server-detail fixture-secret')],
  ] as const)('returns a safe failure for %s', async (_case, response) => {
    const transport = vi.fn().mockResolvedValue(response());
    await expect(
      readProviderCatalog({
        provider: provider(),
        apiKey: 'fixture-secret',
        now: 1,
        beforeSend: async () => undefined,
        transport,
      })
    ).rejects.toMatchObject({ message: 'unknown', reason: 'unknown' });
    expect(transport).toHaveBeenCalledOnce();
  });

  it('refuses egress when current host or provider admission fails', async () => {
    const transport = vi.fn();
    await expect(
      readProviderCatalog({
        provider: provider(),
        apiKey: 'fixture-secret',
        now: 1,
        beforeSend: async () => {
          throw new AIProviderRequestError('permission-denied');
        },
        transport,
      })
    ).rejects.toMatchObject({ reason: 'permission-denied' });
    expect(transport).not.toHaveBeenCalled();
  });

  it('stops before the first request after caller cancellation', async () => {
    const controller = new AbortController();
    controller.abort(new DOMException('Cancelled', 'AbortError'));
    const transport = vi.fn();
    await expect(
      readProviderCatalog({
        provider: provider(),
        apiKey: 'fixture-secret',
        now: 1,
        beforeSend: async () => undefined,
        signal: controller.signal,
        transport,
      })
    ).rejects.toThrow('Cancelled');
    expect(transport).not.toHaveBeenCalled();
  });
});

describe('managed refresh flights', () => {
  it('coalesces simultaneous refresh triggers and admits a later retry after settlement', async () => {
    const pending = deferred<{ models: []; complete: true }>();
    const admission: AICatalogRefreshAdmission = {
      provider: provider(),
      token: {
        providerId: 'provider',
        incarnation: 'incarnation',
        revision: 1,
        credentialRevision: 1,
        generation: 'generation',
        scope: 'scope',
      },
    };
    const started = deferred<void>();
    const read = vi.fn(async () => {
      started.resolve();
      return pending.promise;
    });
    const admit = vi.fn(async () => admission);
    const commit = vi.fn(async () => true);
    const service = createManagedCatalogService({
      readProviders: async () => [provider()],
      admit,
      prepare: async () => 'fixture-secret',
      beforeSend: async () => undefined,
      commit,
      read,
    });
    const first = service.refresh('provider');
    await started.promise;
    const second = service.refresh('provider', true);
    pending.resolve({ models: [], complete: true });
    await Promise.all([first, second]);
    expect(admit).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledOnce();
    await service.refresh('provider', true);
    expect(admit).toHaveBeenCalledTimes(2);
  });

  it('records a locked-secret result without a network call or an unlock prompt', async () => {
    const admission: AICatalogRefreshAdmission = {
      provider: provider(),
      token: {
        providerId: 'provider',
        incarnation: 'incarnation',
        revision: 1,
        credentialRevision: 1,
        generation: 'generation',
        scope: 'scope',
      },
    };
    const read = vi.fn();
    const commit = vi.fn(async () => true);
    const service = createManagedCatalogService({
      readProviders: async () => [provider()],
      admit: async () => admission,
      prepare: async () => {
        throw new AIProviderRequestError('secret-locked');
      },
      beforeSend: async () => undefined,
      commit,
      read,
    });
    await service.refresh('provider');
    expect(read).not.toHaveBeenCalled();
    expect(commit).toHaveBeenCalledWith(admission.token, {
      kind: 'failure',
      reason: 'secret-locked',
      status: 'locked',
    });
  });
});

it.each(['retired', 'active'])(
  'does not publish executable facts from conflicting cursor pages: %s',
  async (status) => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          models: [{ name: 'models/m', supportedGenerationMethods: ['generateContent'] }],
          nextPageToken: 'next',
        })
      )
      .mockResolvedValueOnce(
        json({ models: [{ name: 'models/m', supportedGenerationMethods: [], status }] })
      );
    const page = await readProviderCatalog({
      provider: provider('google'),
      apiKey: 'fixture-secret',
      now: 1,
      beforeSend: async () => undefined,
      transport,
    });
    expect(page.complete).toBe(false);
    expect(page.models[0]?.facts.lifecycle).toBe(status === 'retired' ? 'retired' : 'unknown');
    const result = reconcileManagedCatalog({
      providerId: 'provider',
      scope: 'scope',
      models: [],
      observations: page.models,
      complete: page.complete,
      now: 1,
      referencedModelIds: new Set(),
      createId: () => 'stable',
    });
    expect(supportsAIModelOperation(result.models[0]!, 'text')).toBe(false);
    expect(transport).toHaveBeenCalledTimes(2);
    const recovery = reconcileManagedCatalog({
      providerId: 'provider',
      scope: 'scope',
      models: result.models,
      observations: [
        {
          modelCode: 'm',
          facts: {
            ...page.models[0]!.facts,
            lifecycle: 'active',
            capabilities: {
              operations: { text: 'supported' },
              input: {},
              output: {},
              features: {},
            },
          },
        },
      ],
      complete: true,
      now: 2,
      referencedModelIds: new Set(),
      createId: () => 'must-not-recreate',
    });
    expect(recovery.models[0]?.id).toBe('stable');
    expect(supportsAIModelOperation(recovery.models[0]!, 'text')).toBe(true);
  }
);

it.each(['active', 'retired'])(
  'does not replace conflicted Ollama facts with enrichment: %s',
  async (status) => {
    const transport = vi.fn(async (input) =>
      String(input).endsWith('/show')
        ? json({ capabilities: ['completion'] })
        : json({
            models: [
              { name: 'local', capabilities: ['completion'] },
              { name: 'local', capabilities: [], status },
            ],
          })
    );
    const page = await readProviderCatalog({
      provider: provider('ollama'),
      apiKey: '',
      now: 1,
      beforeSend: async () => undefined,
      transport,
    });
    expect(page.complete).toBe(false);
    expect(page.models[0]?.facts.lifecycle).toBe(status === 'retired' ? 'retired' : 'unknown');
    expect(page.models[0]?.facts.capabilities.operations).toEqual({});
    expect(transport).toHaveBeenCalledOnce();
  }
);

it('keeps identical cursor duplicates complete and executable without duplicating records', async () => {
  const entry = { name: 'models/m', supportedGenerationMethods: ['generateContent'] };
  const transport = vi
    .fn()
    .mockResolvedValueOnce(json({ models: [entry], nextPageToken: 'next' }))
    .mockResolvedValueOnce(json({ models: [entry] }));
  const page = await readProviderCatalog({
    provider: provider('google'),
    apiKey: 'fixture-secret',
    now: 1,
    beforeSend: async () => undefined,
    transport,
  });
  expect(page.complete).toBe(true);
  expect(page.models).toHaveLength(1);
  expect(page.models[0]?.facts.capabilities.operations.text).toBe('supported');
  expect(transport).toHaveBeenCalledTimes(2);
});

it.each([null, 42])(
  'keeps unknown Ollama detail metadata unavailable for execution: %j',
  async (details) => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce(json({ models: [{ name: 'local' }] }))
      .mockResolvedValueOnce(json(details));
    const page = await readProviderCatalog({
      provider: provider('ollama'),
      apiKey: '',
      now: 1,
      beforeSend: async () => undefined,
      transport,
    });
    expect(page.models).toHaveLength(1);
    expect(page.models[0]?.modelCode).toBe('local');
    expect(page.models[0]?.facts.capabilities.operations).toEqual({});
    expect(transport).toHaveBeenCalledTimes(2);
  }
);

it.each([-1])(
  'preserves Ollama list retirement evidence after valid detail enrichment at offset %s',
  async (offset) => {
    const retirementAt = Date.parse('2030-01-01T00:00:00Z');
    const transport = vi
      .fn()
      .mockResolvedValueOnce(
        json({ models: [{ name: 'local', expiration_date: '2030-01-01T00:00:00Z' }] })
      )
      .mockResolvedValueOnce(json({ capabilities: ['completion', 'vision'] }));
    const page = await readProviderCatalog({
      provider: provider('ollama'),
      apiKey: '',
      now: retirementAt + offset,
      beforeSend: async () => undefined,
      transport,
    });
    expect(page.complete).toBe(true);
    expect(page.models[0]?.facts).toMatchObject({
      retirementAt,
      lifecycle: offset < 0 ? 'deprecated' : 'retired',
      capabilities: { operations: { text: 'supported' }, input: { image: 'supported' } },
    });
    expect(transport).toHaveBeenCalledTimes(2);
  }
);

describe('catalog quota error receiving boundary', () => {
  it.each([
    [{ code: 'insufficient_quota' }, 'quota-exceeded'],
    [{ code: 'credit_balance_exhausted' }, 'quota-exceeded'],
    [{ code: 'organization_spend_limit_exceeded' }, 'quota-exceeded'],
    [{ code: 'project_spend_limit_exceeded' }, 'quota-exceeded'],
    [{ code: 'organization_usage_limit_exceeded' }, 'quota-exceeded'],
    [{ type: 'insufficient_quota' }, 'quota-exceeded'],
    [{ code: 'unknown_quota_code' }, 'rate-limited'],
    [{ code: 429 }, 'rate-limited'],
    [{ code: ['insufficient_quota'] }, 'rate-limited'],
    [{ message: 'insufficient_quota' }, 'rate-limited'],
  ] as const)(
    'reads bounded HTTP 429 metadata %j as %s without replay',
    async (metadata, reason) => {
      const transport = vi.fn().mockResolvedValue(
        json(
          {
            error: { privateDetail: 'private-response fixture-secret', ...metadata },
          },
          429
        )
      );
      let failure: unknown;
      try {
        await readProviderCatalog({
          provider: provider(),
          apiKey: 'fixture-secret',
          now: 1,
          beforeSend: async () => undefined,
          transport,
        });
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(AIProviderRequestError);
      expect(failure).toMatchObject({ reason, message: reason });
      for (const field of [
        'cause',
        'data',
        'responseBody',
        'responseHeaders',
        'requestBodyValues',
      ]) {
        expect(failure).not.toHaveProperty(field);
      }
      expect(JSON.stringify(failure)).not.toMatch(/private-|fixture-secret/);
      expect(transport).toHaveBeenCalledOnce();
    }
  );

  it.each(['not-json insufficient_quota', '{"error":', '', 'null', '[]'])(
    'keeps malformed or absent HTTP 429 metadata rate-limited: %j',
    async (body) => {
      const transport = vi.fn().mockResolvedValue(new Response(body, { status: 429 }));
      await expect(
        readProviderCatalog({
          provider: provider(),
          apiKey: 'fixture-secret',
          now: 1,
          beforeSend: async () => undefined,
          transport,
        })
      ).rejects.toMatchObject({ reason: 'rate-limited', message: 'rate-limited' });
      expect(transport).toHaveBeenCalledOnce();
    }
  );

  it.each([
    [401, 'invalid-credential'],
    [403, 'permission-denied'],
    [402, 'quota-exceeded'],
    [404, 'catalog-unsupported'],
    [503, 'service-error'],
  ])('keeps catalog HTTP %i authoritative over quota metadata', async (status, reason) => {
    const transport = vi
      .fn()
      .mockResolvedValue(json({ error: { code: 'insufficient_quota' } }, status));
    await expect(
      readProviderCatalog({
        provider: provider(),
        apiKey: 'fixture-secret',
        now: 1,
        beforeSend: async () => undefined,
        transport,
      })
    ).rejects.toMatchObject({ reason, message: reason });
    expect(transport).toHaveBeenCalledOnce();
  });

  it('bounds and cancels streamed quota error bodies before interpreting metadata', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('{"error":{"code":"insufficient_quota","message":"')
        );
        controller.enqueue(new Uint8Array(2 * 1024 * 1024));
      },
      cancel,
    });
    const transport = vi.fn().mockResolvedValue(new Response(body, { status: 429 }));
    await expect(
      readProviderCatalog({
        provider: provider(),
        apiKey: 'fixture-secret',
        now: 1,
        beforeSend: async () => undefined,
        transport,
      })
    ).rejects.toMatchObject({ reason: 'unknown', message: 'unknown' });
    expect(cancel).toHaveBeenCalledOnce();
    expect(transport).toHaveBeenCalledOnce();
  });

  it.each([
    ['insufficient_quota', 'quota-exceeded'],
    ['rate_limit_exceeded', 'rate-limited'],
  ] as const)(
    'publishes only a fixed failure after a real catalog HTTP 429: %s',
    async (code, reason) => {
      const admission: AICatalogRefreshAdmission = {
        provider: provider(),
        token: {
          providerId: 'provider',
          incarnation: 'incarnation',
          revision: 1,
          credentialRevision: 1,
          generation: 'generation',
          scope: 'scope',
        },
      };
      const transport = vi.fn().mockResolvedValue(
        json(
          {
            data: [{ id: 'must-not-publish', type: 'chat' }],
            error: { code, message: 'private-response fixture-secret' },
          },
          429
        )
      );
      const commit = vi.fn(async () => true);
      const service = createManagedCatalogService({
        readProviders: async () => [provider()],
        admit: async () => admission,
        prepare: async () => 'fixture-secret',
        beforeSend: async () => undefined,
        commit,
        read: (options) => readProviderCatalog({ ...options, transport }),
      });
      expect(await service.refresh('provider')).toBe(true);
      expect(commit).toHaveBeenCalledExactlyOnceWith(admission.token, { kind: 'failure', reason });
      expect(JSON.stringify(commit.mock.calls)).not.toMatch(
        /private-|fixture-secret|must-not-publish/
      );
      expect(transport).toHaveBeenCalledOnce();
    }
  );

  it('does not downgrade a successful complete catalog because a model contains an error-like field', async () => {
    const transport = vi.fn().mockResolvedValue(
      json({
        data: [{ id: 'stable-model', type: 'chat', error: { code: 'insufficient_quota' } }],
      })
    );
    const page = await readProviderCatalog({
      provider: provider(),
      apiKey: 'fixture-secret',
      now: 1,
      beforeSend: async () => undefined,
      transport,
    });
    expect(page.complete).toBe(true);
    expect(page.models.map((model) => model.modelCode)).toEqual(['stable-model']);
    expect(transport).toHaveBeenCalledOnce();
  });
});
