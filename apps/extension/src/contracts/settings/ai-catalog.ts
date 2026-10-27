/** Execution operations currently consumed by product interfaces. */
export type AIModelOperation = 'text' | 'transcription' | 'speech';
/** Known support differs from missing metadata. Never treat unknown as permission to send a new data class. */
export type AISupport = 'supported' | 'unsupported' | 'unknown';
export type AIModality = 'text' | 'image' | 'audio' | 'video' | 'file';
export type AIModelTask =
  | 'text'
  | 'transcription'
  | 'speech'
  | 'image-generation'
  | 'image-editing'
  | 'background-removal';
export type AIModelLifecycle = 'active' | 'deprecated' | 'retired' | 'absent' | 'unknown';
export type AIModelSource = 'catalog' | 'manual';
export type AIModelFeature =
  | 'structured-output'
  | 'tools'
  | 'streaming'
  | 'mask'
  | 'word-timestamps'
  | 'segment-timestamps';

export interface AIModelCapabilities {
  operations: Partial<Record<AIModelTask, AISupport>>;
  input: Partial<Record<AIModality, AISupport>>;
  output: Partial<Record<AIModality, AISupport>>;
  features: Partial<Record<AIModelFeature, AISupport>>;
  contextWindow?: number;
  maxOutputTokens?: number;
}

export interface AICatalogFacts {
  scope?: string;
  capabilities: AIModelCapabilities;
  displayName: string;
  lifecycle: AIModelLifecycle;
  observedAt: number;
  retirementAt?: number;
  firstAbsentAt?: number;
  lastAbsentAt?: number;
  absenceCount?: number;
}

export type AIConnectionReason =
  | 'invalid-credential'
  | 'permission-denied'
  | 'model-unavailable'
  | 'quota-exceeded'
  | 'rate-limited'
  | 'network'
  | 'timeout'
  | 'service-error'
  | 'unknown'
  | 'host-permission-required'
  | 'secret-locked'
  | 'catalog-unsupported'
  | 'provider-unavailable';

export interface AIConnectionObservation {
  status: 'unverified' | 'available' | 'unavailable' | 'permission-required' | 'locked';
  scope: 'credentials' | 'catalog' | 'operation';
  checkedAt: number;
  revision: number;
  reason?: AIConnectionReason;
  lastSuccessAt?: number;
}

/** These identifiers describe interface scenarios, not one global default or a model's operation type. */
export const AI_PERSISTED_SCENARIOS = [
  'page-edit',
  'page-extract',
  'scenario-edit',
  'gallery-text-edit',
  'video-text-edit',
  'gallery-speech',
  'video-speech',
  'scenario-speech',
  'gallery-transcription',
  'video-transcription',
] as const;
export const AI_SCENARIOS = [
  ...AI_PERSISTED_SCENARIOS,
  'voice-recognition',
  'voice-correction',
] as const;
export type AIScenario = (typeof AI_SCENARIOS)[number];
export type AIPersistedScenario = Exclude<AIScenario, 'voice-recognition' | 'voice-correction'>;

export interface AIScenarioSelection {
  providerIncarnation: string;
  modelId: string;
  modelCode: string;
  providerId: string;
  displayName: string;
  selectedAt: number;
  source: 'explicit' | 'initial';
}

/** Voice scenario values come from canonical VoiceInputPreferences and must not enter this map. */
export type AIScenarioSelections = Partial<Record<AIPersistedScenario, AIScenarioSelection>>;

export function isAIScenario(value: unknown): value is AIScenario {
  return typeof value === 'string' && AI_SCENARIOS.some((scenario) => scenario === value);
}

export function isAIPersistedScenario(value: unknown): value is AIPersistedScenario {
  return isAIScenario(value) && value !== 'voice-recognition' && value !== 'voice-correction';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isSupportMap(value: unknown, keys: readonly string[]): boolean {
  return (
    isRecord(value) &&
    Object.entries(value).every(
      ([key, item]) =>
        keys.includes(key) && (item === 'supported' || item === 'unsupported' || item === 'unknown')
    )
  );
}
function optionalNonnegative(value: unknown): boolean {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}

/** Checks stored or IPC capability facts without inferring support from model names. */
export function isAIModelCapabilities(value: unknown): value is AIModelCapabilities {
  if (!isRecord(value)) return false;
  return (
    Object.keys(value).every((key) =>
      ['operations', 'input', 'output', 'features', 'contextWindow', 'maxOutputTokens'].includes(
        key
      )
    ) &&
    isSupportMap(value['operations'], [
      'text',
      'transcription',
      'speech',
      'image-generation',
      'image-editing',
      'background-removal',
    ]) &&
    isSupportMap(value['input'], ['text', 'image', 'audio', 'video', 'file']) &&
    isSupportMap(value['output'], ['text', 'image', 'audio', 'video', 'file']) &&
    isSupportMap(value['features'], [
      'structured-output',
      'tools',
      'streaming',
      'mask',
      'word-timestamps',
      'segment-timestamps',
    ]) &&
    optionalNonnegative(value['contextWindow']) &&
    optionalNonnegative(value['maxOutputTokens'])
  );
}

export function isAICatalogFacts(value: unknown): value is AICatalogFacts {
  return (
    isRecord(value) &&
    Object.keys(value).every((key) =>
      [
        'scope',
        'capabilities',
        'displayName',
        'lifecycle',
        'observedAt',
        'retirementAt',
        'firstAbsentAt',
        'lastAbsentAt',
        'absenceCount',
      ].includes(key)
    ) &&
    typeof value['displayName'] === 'string' &&
    value['displayName'].length <= 500 &&
    typeof value['observedAt'] === 'number' &&
    optionalNonnegative(value['observedAt']) &&
    ['active', 'deprecated', 'retired', 'absent', 'unknown'].includes(
      typeof value['lifecycle'] === 'string' ? value['lifecycle'] : ''
    ) &&
    isAIModelCapabilities(value['capabilities']) &&
    (value['scope'] === undefined ||
      (typeof value['scope'] === 'string' && value['scope'].length <= 1000)) &&
    ['retirementAt', 'firstAbsentAt', 'lastAbsentAt', 'absenceCount'].every((field) =>
      optionalNonnegative(value[field])
    )
  );
}

export function isAIConnectionObservation(value: unknown): value is AIConnectionObservation {
  if (
    !isRecord(value) ||
    !Object.keys(value).every((key) =>
      ['status', 'scope', 'checkedAt', 'revision', 'reason', 'lastSuccessAt'].includes(key)
    )
  )
    return false;

  return (
    ['unverified', 'available', 'unavailable', 'permission-required', 'locked'].includes(
      typeof value['status'] === 'string' ? value['status'] : ''
    ) &&
    ['credentials', 'catalog', 'operation'].includes(
      typeof value['scope'] === 'string' ? value['scope'] : ''
    ) &&
    typeof value['checkedAt'] === 'number' &&
    optionalNonnegative(value['checkedAt']) &&
    typeof value['revision'] === 'number' &&
    optionalNonnegative(value['revision']) &&
    optionalNonnegative(value['lastSuccessAt']) &&
    (value['reason'] === undefined || isAIConnectionReason(value['reason']))
  );
}

export interface AIRememberScenarioSelectionInput {
  scenario: AIPersistedScenario;
  modelId: string;
  providerId: string;
  modelCode: string;
  destinationBinding?: string | undefined;
  source: 'explicit' | 'initial';
}

/** Maps interface scenarios to operations without creating a second voice preference authority. */
export function getAIScenarioOperation(scenario: AIScenario): 'text' | 'transcription' | 'speech' {
  if (
    scenario === 'voice-recognition' ||
    scenario === 'gallery-transcription' ||
    scenario === 'video-transcription'
  )
    return 'transcription';
  if (
    scenario === 'gallery-speech' ||
    scenario === 'video-speech' ||
    scenario === 'scenario-speech'
  )
    return 'speech';
  return 'text';
}

/** Reject invalid entries and duplicate voice authorities without repairing persistent state. */
export function parseAIScenarioSelections(value: unknown): AIScenarioSelections {
  if (!isRecord(value)) return {};
  const selections: AIScenarioSelections = {};
  for (const [scenario, entry] of Object.entries(value)) {
    if (!isAIPersistedScenario(scenario) || !isRecord(entry)) continue;
    if (
      Object.keys(entry).some(
        (key) =>
          ![
            'modelId',
            'modelCode',
            'providerId',
            'providerIncarnation',
            'displayName',
            'selectedAt',
            'source',
          ].includes(key)
      )
    )
      continue;
    if (
      !['modelId', 'modelCode', 'providerId', 'providerIncarnation', 'displayName'].every(
        (key) => typeof entry[key] === 'string' && entry[key].length > 0 && entry[key].length <= 500
      )
    )
      continue;
    if (
      typeof entry['selectedAt'] !== 'number' ||
      !Number.isFinite(entry['selectedAt']) ||
      entry['selectedAt'] < 0 ||
      (entry['source'] !== 'explicit' && entry['source'] !== 'initial')
    )
      continue;
    selections[scenario] = {
      modelId: String(entry['modelId']),
      modelCode: String(entry['modelCode']),
      providerId: String(entry['providerId']),
      providerIncarnation: String(entry['providerIncarnation']),
      displayName: String(entry['displayName']),
      selectedAt: entry['selectedAt'],
      source: entry['source'],
    };
  }
  return selections;
}

/** Admits only fixed provider failure reasons at runtime boundaries. */
export function isAIConnectionReason(value: unknown): value is AIConnectionReason {
  const reasons: readonly AIConnectionReason[] = [
    'host-permission-required',
    'invalid-credential',
    'permission-denied',
    'model-unavailable',
    'quota-exceeded',
    'rate-limited',
    'network',
    'timeout',
    'service-error',
    'unknown',
    'secret-locked',
    'catalog-unsupported',
    'provider-unavailable',
  ];
  return reasons.some((reason) => reason === value);
}
