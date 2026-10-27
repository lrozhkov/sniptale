import type { AICatalogProtocol } from '../../../contracts/settings/ai-provider';
import type {
  AIModelCapabilities,
  AICatalogFacts,
  AIModality,
  AIModelTask,
  AISupport,
} from '../../../contracts/settings/ai-catalog';

export interface ParsedCatalogModel {
  modelCode: string;
  facts: AICatalogFacts;
}
export interface ParsedCatalogPage {
  models: ParsedCatalogModel[];
  complete: boolean;
  nextCursor?: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function boundedString(value: unknown, maximum = 500): string | undefined {
  return typeof value === 'string' && value.trim() && value.length <= maximum
    ? value.trim()
    : undefined;
}
function positiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}
function strings(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item): item is string => typeof item === 'string')
    ? value
    : undefined;
}
function support(value: unknown): AISupport {
  return value === true ? 'supported' : value === false ? 'unsupported' : 'unknown';
}
const MODALITIES: readonly AIModality[] = ['text', 'image', 'audio', 'video', 'file'];
function modalityFacts(value: unknown): Partial<Record<AIModality, AISupport>> {
  const list = strings(value);
  return list
    ? Object.fromEntries(
        MODALITIES.map((item) => [item, list.includes(item) ? 'supported' : 'unsupported'])
      )
    : {};
}

function operationFacts(
  item: Record<string, unknown>,
  input: AIModelCapabilities['input'],
  output: AIModelCapabilities['output']
): AIModelCapabilities['operations'] {
  const operations: AIModelCapabilities['operations'] = {};
  const kind = item['type'];
  if (kind === 'chat' || kind === 'text' || kind === 'completion') operations.text = 'supported';
  if (kind === 'stt' || kind === 'transcription') operations.transcription = 'supported';
  if (kind === 'tts' || kind === 'speech') operations.speech = 'supported';
  if (kind === 'image-generation') operations['image-generation'] = 'supported';
  if (kind === 'image-editing') operations['image-editing'] = 'supported';
  if (kind === 'background-removal') operations['background-removal'] = 'supported';
  if (output.text === 'supported' && input.text === 'supported') operations.text = 'supported';
  if (output.image === 'supported' && input.text === 'supported' && input.image === 'unsupported')
    operations['image-generation'] = 'supported';
  const endpoints = (strings(item['endpoints']) ?? []).map((endpoint) => {
    const parts = endpoint.split('/');
    if (parts[0] === '' && /^v[0-9]+$/u.test(parts[1] ?? '')) parts.splice(1, 1);
    return parts.join('/');
  });
  if (endpoints.includes('/images/generations') || endpoints.includes('/images/generate'))
    operations['image-generation'] = 'supported';
  if (endpoints.includes('/images/edits') || endpoints.includes('/images/edit'))
    operations['image-editing'] = 'supported';
  if (endpoints.includes('/images/background/remove'))
    operations['background-removal'] = 'supported';
  const methods = strings(item['supportedGenerationMethods']);
  if (methods?.includes('generateContent')) operations.text = 'supported';
  const capabilities = item['capabilities'];
  if (Array.isArray(capabilities) && capabilities.includes('completion'))
    operations.text = 'supported';
  if (item['can_do_text_to_speech'] === true) operations.speech = 'supported';
  if (item['can_do_speech_to_text'] === true) operations.transcription = 'supported';
  const declared = record(capabilities) ? capabilities['operations'] : undefined;
  if (record(declared)) {
    const tasks: readonly AIModelTask[] = [
      'text',
      'transcription',
      'speech',
      'image-generation',
      'image-editing',
      'background-removal',
    ];
    for (const task of tasks)
      if (typeof declared[task] === 'boolean') operations[task] = support(declared[task]);
  }
  return operations;
}

function capabilities(
  item: Record<string, unknown>,
  protocol: AICatalogProtocol
): AIModelCapabilities {
  const architecture = record(item['architecture']) ? item['architecture'] : {};
  const modalities = record(item['modalities']) ? item['modalities'] : {};
  const input = modalityFacts(
    architecture['input_modalities'] ?? item['input_modalities'] ?? modalities['input']
  );
  const output = modalityFacts(
    architecture['output_modalities'] ?? item['output_modalities'] ?? modalities['output']
  );
  const raw = record(item['capabilities']) ? item['capabilities'] : {};
  const list = strings(item['capabilities']);
  if (typeof raw['vision'] === 'boolean') input.image ??= support(raw['vision']);
  if (list?.includes('vision')) input.image ??= 'supported';
  const operations = operationFacts(item, input, output);
  if (protocol === 'anthropic' && item['type'] === 'model') operations.text = 'supported';
  if (protocol === 'cohere' && strings(item['endpoints'])?.includes('chat'))
    operations.text = 'supported';
  if (raw['completion_chat'] === true) operations.text = 'supported';
  const imageInput = record(raw['image_input']) ? raw['image_input']['supported'] : undefined;
  if (typeof imageInput === 'boolean') input.image = support(imageInput);
  const structured = record(raw['structured_outputs'])
    ? raw['structured_outputs']['supported']
    : undefined;
  if (operations.text === 'supported') {
    input.text ??= 'supported';
    output.text ??= 'supported';
  }
  if (operations.transcription === 'supported') {
    input.audio ??= 'supported';
    output.text ??= 'supported';
  }
  if (operations.speech === 'supported') {
    input.text ??= 'supported';
    output.audio ??= 'supported';
  }
  return {
    operations,
    input,
    output,
    features: featureFacts(item, raw, list, structured),
    ...tokenLimits(item),
  };
}

function tokenLimits(item: Record<string, unknown>) {
  const limits = record(item['limit']) ? item['limit'] : {};
  const contextWindow = positiveNumber(
    item['context_length'] ??
      item['inputTokenLimit'] ??
      item['max_input_tokens'] ??
      limits['context']
  );
  const maxOutputTokens = positiveNumber(
    item['outputTokenLimit'] ?? item['max_tokens'] ?? limits['output']
  );
  return {
    ...(contextWindow === undefined ? {} : { contextWindow }),
    ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
  };
}

function featureFacts(
  item: Record<string, unknown>,
  raw: Record<string, unknown>,
  list: string[] | undefined,
  structured: unknown
): AIModelCapabilities['features'] {
  const parameters = strings(item['supported_parameters']);
  return {
    tools: support(
      raw['tools'] ??
        item['tool_call'] ??
        (parameters ? parameters.includes('tools') : undefined) ??
        (list ? list.includes('tools') : undefined)
    ),
    streaming: support(raw['streaming']),
    'structured-output': support(
      structured ??
        raw['structured_output'] ??
        (parameters ? parameters.includes('response_format') : undefined)
    ),
    mask: support(raw['mask']),
    'word-timestamps': support(raw['word_timestamps']),
    'segment-timestamps': support(raw['segment_timestamps']),
  };
}

function parseModel(
  value: unknown,
  protocol: AICatalogProtocol,
  now: number
): ParsedCatalogModel | null {
  if (!record(value)) return null;
  const rawId = boundedString(
    value['id'] ??
      value['model_id'] ??
      (protocol === 'google' || protocol === 'ollama' || protocol === 'cohere'
        ? value['name']
        : undefined)
  );
  const originalId = value['id'] ?? value['model_id'] ?? value['name'];
  if (rawId !== originalId) return null;
  if (!rawId) return null;
  const modelCode = protocol === 'google' && rawId.startsWith('models/') ? rawId.slice(7) : rawId;
  const date = boundedString(value['expiration_date'], 64);
  const retirementAt = date ? Date.parse(date) : undefined;
  const retirement =
    retirementAt !== undefined && Number.isFinite(retirementAt) ? retirementAt : undefined;
  const lifecycle =
    (value['lifecycle'] ?? value['status']) === 'retired' ||
    (retirement !== undefined && retirement <= now)
      ? 'retired'
      : (value['lifecycle'] ?? value['status']) === 'deprecated' ||
          value['is_deprecated'] === true ||
          retirement !== undefined
        ? 'deprecated'
        : 'active';
  return {
    modelCode,
    facts: {
      capabilities: capabilities(value, protocol),
      displayName:
        boundedString(value['displayName'] ?? value['display_name'] ?? value['name'], 200) ??
        modelCode,
      lifecycle,
      observedAt: now,
      ...(retirement === undefined ? {} : { retirementAt: retirement }),
    },
  };
}

/** Preserves retirement evidence and clears disputed capabilities for the same exact remote identity. */
export function mergeConflictingCatalogModels(
  previous: ParsedCatalogModel,
  incoming: ParsedCatalogModel
): ParsedCatalogModel {
  const dates = [previous.facts.retirementAt, incoming.facts.retirementAt].filter(
    (date): date is number => date !== undefined
  );
  return {
    modelCode: incoming.modelCode,
    facts: {
      displayName: incoming.modelCode,
      observedAt: Math.max(previous.facts.observedAt, incoming.facts.observedAt),
      lifecycle:
        previous.facts.lifecycle === 'retired' || incoming.facts.lifecycle === 'retired'
          ? 'retired'
          : 'unknown',
      capabilities: { operations: {}, input: {}, output: {}, features: {} },
      ...(dates.length ? { retirementAt: Math.min(...dates) } : {}),
    },
  };
}

/** Parses untrusted provider metadata. Partial results never authorize catalog deletion. */
export function parseAICatalogPage(
  value: unknown,
  protocol: AICatalogProtocol,
  now: number
): ParsedCatalogPage {
  const root = record(value) ? value : {};
  const items = Array.isArray(value) ? value : (root['data'] ?? root['models'] ?? root['items']);
  if (!Array.isArray(items) || items.length > 10000) return { models: [], complete: false };
  const models = new Map<string, ParsedCatalogModel>();
  let complete = true;
  for (const item of items) {
    const parsed = parseModel(item, protocol, now);
    if (!parsed) {
      complete = false;
      continue;
    }
    const previous = models.get(parsed.modelCode);
    if (previous && JSON.stringify(previous.facts) !== JSON.stringify(parsed.facts)) {
      complete = false;
      models.set(parsed.modelCode, mergeConflictingCatalogModels(previous, parsed));
    } else models.set(parsed.modelCode, parsed);
  }
  const pagination = record(root['pagination']) ? root['pagination'] : {};
  const nextCursor = boundedString(
    root['nextPageToken'] ??
      root['next_page_token'] ??
      pagination['next_page_token'] ??
      (root['has_more'] === true ? root['last_id'] : undefined)
  );
  if (root['has_more'] === true && !nextCursor) complete = false;
  return { models: [...models.values()], complete, ...(nextCursor ? { nextCursor } : {}) };
}
