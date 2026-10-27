import { describe, expect, it } from 'vitest';
import { parseAICatalogPage } from './catalog-parser';

describe('provider catalog metadata', () => {
  it('classifies NeuralDeep metadata without inferring capabilities from model names', () => {
    const page = parseAICatalogPage(
      {
        data: [
          {
            id: 'arbitrary-name',
            type: 'chat',
            modalities: { input: ['text', 'image'], output: ['text'] },
            capabilities: { vision: true, tools: true },
          },
          { id: 'gpt-vision-transcribe', type: 'embedding' },
          { id: 'voice', type: 'stt' },
        ],
      },
      'openai',
      1
    );
    expect(page.complete).toBe(true);
    expect(page.models[0]?.facts.capabilities).toMatchObject({
      operations: { text: 'supported' },
      input: { image: 'supported' },
      features: { tools: 'supported', 'word-timestamps': 'unknown' },
    });
    expect(page.models[1]?.facts.capabilities.operations).toEqual({});
    expect(page.models[2]?.facts.capabilities.operations).toEqual({ transcription: 'supported' });
  });

  it('keeps missing metadata unknown and image input separate from generation or mask support', () => {
    const page = parseAICatalogPage(
      {
        data: [
          {
            id: 'm',
            architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
          },
        ],
      },
      'openrouter',
      1
    );
    expect(page.models[0]?.facts.capabilities.operations).toEqual({ text: 'supported' });
    expect(page.models[0]?.facts.capabilities.features.mask).toBe('unknown');
  });

  it('marks malformed or conflicting pages partial instead of authorizing deletion', () => {
    expect(parseAICatalogPage({}, 'openai', 1).complete).toBe(false);
    expect(parseAICatalogPage({ data: [{ id: 'm' }, { wrong: true }] }, 'openai', 1).complete).toBe(
      false
    );
    expect(
      parseAICatalogPage(
        {
          data: [
            { id: 'm', type: 'chat' },
            { id: 'm', type: 'stt' },
          ],
        },
        'openai',
        1
      ).complete
    ).toBe(false);
    expect(parseAICatalogPage({ data: [], has_more: true }, 'anthropic', 1).complete).toBe(false);
  });

  it('exposes cursors and normalizes only the documented Google model prefix', () => {
    const page = parseAICatalogPage(
      {
        models: [{ name: 'models/m', supportedGenerationMethods: ['generateContent'] }],
        nextPageToken: 'next',
      },
      'google',
      1
    );
    expect(page.nextCursor).toBe('next');
    expect(page.models[0]?.modelCode).toBe('m');
    expect(page.models[0]?.facts.capabilities.operations.text).toBe('supported');
    expect(
      parseAICatalogPage({ data: [{ id: 'models/m' }] }, 'openai', 1).models[0]?.modelCode
    ).toBe('models/m');
  });

  it('distinguishes image operations from declared endpoints without using model names', () => {
    const page = parseAICatalogPage(
      {
        data: [
          { id: 'arbitrary-one', type: 'image', endpoints: ['/v1/images/generate'] },
          {
            id: 'arbitrary-two',
            type: 'image',
            endpoints: ['/v1/images/edit'],
            modalities: { input: ['text', 'image'], output: ['image'] },
            capabilities: { vision: false },
          },
          { id: 'arbitrary-three', type: 'image', endpoints: ['/v1/images/background/remove'] },
          {
            id: 'image-generator-by-name-only',
            type: 'image',
            modalities: { input: ['image'], output: ['image'] },
          },
        ],
      },
      'openai',
      1
    );
    expect(page.models.map((model) => model.facts.capabilities.operations)).toEqual([
      { 'image-generation': 'supported' },
      { 'image-editing': 'supported' },
      { 'background-removal': 'supported' },
      {},
    ]);
  });

  it('reads documented native capability fields and preserves exact IDs', () => {
    const anthropic = parseAICatalogPage(
      {
        data: [
          {
            id: 'exact-id',
            type: 'model',
            max_input_tokens: 200000,
            max_tokens: 64000,
            capabilities: {
              image_input: { supported: true },
              structured_outputs: { supported: true },
            },
          },
        ],
      },
      'anthropic',
      1
    );
    expect(anthropic.models[0]?.facts.capabilities).toMatchObject({
      operations: { text: 'supported' },
      input: { image: 'supported' },
      features: { 'structured-output': 'supported' },
      contextWindow: 200000,
      maxOutputTokens: 64000,
    });
    expect(
      parseAICatalogPage(
        { models: [{ name: 'cohere-id', endpoints: ['chat'], is_deprecated: true }] },
        'cohere',
        1
      ).models[0]?.facts.lifecycle
    ).toBe('deprecated');
    expect(parseAICatalogPage({ data: [{ id: ' id-with-space ' }] }, 'openai', 1)).toEqual({
      models: [],
      complete: false,
    });
  });

  it('uses explicit retirement evidence and does not treat unknown status as retirement', () => {
    const page = parseAICatalogPage(
      {
        data: [
          { id: 'old', expiration_date: '2020-01-01' },
          { id: 'future', expiration_date: '2030-01-01' },
          { id: 'unknown', status: 'disabled' },
        ],
      },
      'openrouter',
      Date.UTC(2026, 9, 26)
    );
    expect(page.models.map((model) => model.facts.lifecycle)).toEqual([
      'retired',
      'deprecated',
      'active',
    ]);
  });
});

it.each([
  { statuses: ['active', 'retired'] },
  { statuses: ['retired', 'active'] },
  { statuses: ['active', 'retired', 'active'] },
])(
  'retains retirement and removes disputed capabilities for duplicate rows $statuses',
  ({ statuses }) => {
    const page = parseAICatalogPage(
      {
        data: statuses.map((status) => ({
          id: 'exact-id',
          type: 'chat',
          status,
          name: 'Disputed label',
          expiration_date: status === 'retired' ? '2020-01-01T00:00:00Z' : '2030-01-01T00:00:00Z',
        })),
      },
      'openai',
      Date.parse('2026-01-01T00:00:00Z')
    );
    expect(page.complete).toBe(false);
    expect(page.models).toHaveLength(1);
    expect(page.models[0]).toMatchObject({
      modelCode: 'exact-id',
      facts: {
        displayName: 'exact-id',
        lifecycle: 'retired',
        retirementAt: Date.parse('2020-01-01T00:00:00Z'),
        capabilities: { operations: {}, input: {}, output: {}, features: {} },
      },
    });
  }
);

it('keeps identical duplicate facts complete and clears contradictory operation claims', () => {
  const entry = { id: 'm', type: 'chat' };
  expect(parseAICatalogPage({ data: [entry, entry] }, 'openai', 1)).toMatchObject({
    complete: true,
    models: [
      { facts: { lifecycle: 'active', capabilities: { operations: { text: 'supported' } } } },
    ],
  });
  const page = parseAICatalogPage(
    { data: [entry, { id: 'm', type: 'embedding' }, entry] },
    'openai',
    1
  );
  expect(page).toMatchObject({
    complete: false,
    models: [
      {
        facts: {
          lifecycle: 'unknown',
          capabilities: { operations: {}, input: {}, output: {}, features: {} },
        },
      },
    ],
  });
});
