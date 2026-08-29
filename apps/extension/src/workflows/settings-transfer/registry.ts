// policyStateIds: [] - the transfer catalog is immutable Settings visibility policy, not authority state.
import type {
  SettingsTransferClassification,
  SettingsTransferNodeKind,
  SettingsTransferStrategy,
} from '../../contracts/settings-transfer';

export interface SettingsTransferRegistryNode {
  id: string;
  domainId: string;
  parentId: string | null;
  labelKey: string;
  descriptionKey: string;
  kind: SettingsTransferNodeKind;
  classification: SettingsTransferClassification;
  schemaVersion: number;
  strategies: readonly SettingsTransferStrategy[];
  dependencies: readonly string[];
  dynamicItems?: boolean;
}

const ALL_STRATEGIES = [
  'safe-merge',
  'overwrite-matching',
  'exact-restore',
] as const satisfies readonly SettingsTransferStrategy[];
const SCALAR_STRATEGIES = [
  'safe-merge',
  'overwrite-matching',
  'exact-restore',
] as const satisfies readonly SettingsTransferStrategy[];

function domain(
  id: string,
  children: readonly Omit<
    SettingsTransferRegistryNode,
    'domainId' | 'parentId' | 'schemaVersion' | 'strategies'
  >[]
): SettingsTransferRegistryNode[] {
  const root: SettingsTransferRegistryNode = {
    id,
    domainId: id,
    parentId: null,
    labelKey: `settings.settingsTransfer.domains.${toTranslationSegment(id)}`,
    descriptionKey: 'settings.settingsTransfer.domainDescription',
    kind: children.some((child) => child.kind === 'collection') ? 'collection' : 'scalar',
    classification: 'transferable',
    schemaVersion: 1,
    strategies: ALL_STRATEGIES,
    dependencies: [],
  };
  return [
    root,
    ...children.map((child) => ({
      ...child,
      domainId: id,
      parentId: id,
      schemaVersion: 1,
      strategies: child.kind === 'scalar' ? SCALAR_STRATEGIES : ALL_STRATEGIES,
    })),
  ];
}

function field(
  domainId: string,
  name: string,
  options: Partial<
    Pick<SettingsTransferRegistryNode, 'classification' | 'dependencies' | 'dynamicItems' | 'kind'>
  > = {}
): Omit<SettingsTransferRegistryNode, 'domainId' | 'parentId' | 'schemaVersion' | 'strategies'> {
  const id = `${domainId}.${name}`;
  return {
    id,
    labelKey: `settings.settingsTransfer.fields.${toTranslationSegment(name)}`,
    descriptionKey: 'settings.settingsTransfer.fieldDescription',
    kind: options.kind ?? 'scalar',
    classification: options.classification ?? 'transferable',
    dependencies: options.dependencies ?? [],
    ...(options.dynamicItems ? { dynamicItems: true } : {}),
  };
}

function toTranslationSegment(value: string): string {
  return value.replace(/[.-]([a-z0-9])/g, (_match, letter: string) => letter.toUpperCase());
}

export const SETTINGS_TRANSFER_REGISTRY = [
  ...domain('interface.preferences', [
    field('interface.preferences', 'theme'),
    field('interface.preferences', 'locale'),
    field('interface.preferences', 'popup-startup'),
    field('interface.preferences', 'context-menu'),
  ]),
  ...domain('capture.quick-actions', [
    field('capture.quick-actions', 'items', { kind: 'collection', dynamicItems: true }),
  ]),
  ...domain('capture.viewport-presets', [
    field('capture.viewport-presets', 'items', { kind: 'collection', dynamicItems: true }),
    field('capture.viewport-presets', 'default'),
  ]),
  ...domain('capture.image', [
    field('capture.image', 'format'),
    field('capture.image', 'quality'),
    field('capture.image', 'fullPageQuality'),
  ]),
  ...domain('capture.pages', [field('capture.pages', 'timing')]),
  ...domain('capture.video', [
    field('capture.video', 'profiles', { kind: 'collection', dynamicItems: true }),
    field('capture.video', 'selection'),
    field('capture.video', 'output'),
  ]),
  ...domain('capture.after-capture', [field('capture.after-capture', 'action')]),
  ...domain('capture.saving', [
    field('capture.saving', 'templates', { kind: 'collection', dynamicItems: true }),
    field('capture.saving', 'defaults'),
  ]),
  ...domain('capture.retention', [field('capture.retention', 'policy')]),
  ...domain('styles.borders', [
    field('styles.borders', 'items', { kind: 'collection', dynamicItems: true }),
    field('styles.borders', 'defaults'),
  ]),
  ...domain('styles.callouts', [
    field('styles.callouts', 'items', { kind: 'collection', dynamicItems: true }),
    field('styles.callouts', 'defaults'),
  ]),
  ...domain('styles.numbering', [
    field('styles.numbering', 'items', { kind: 'collection', dynamicItems: true }),
    field('styles.numbering', 'defaults'),
  ]),
  ...domain('styles.tags', [
    field('styles.tags', 'items', { kind: 'collection', dynamicItems: true }),
    field('styles.tags', 'active-filter'),
  ]),
  ...domain('styles.tool-presets', [
    field('styles.tool-presets', 'items', { kind: 'collection', dynamicItems: true }),
  ]),
  ...domain('styles.palettes', [
    field('styles.palettes', 'items', { kind: 'collection', dynamicItems: true }),
  ]),
  ...domain('styles.surfaces', [
    field('styles.surfaces', 'items', { kind: 'collection', dynamicItems: true }),
  ]),
  ...domain('styles.gradients', [
    field('styles.gradients', 'items', { kind: 'collection', dynamicItems: true }),
  ]),
  ...domain('ai.providers', [
    field('ai.providers', 'items', { kind: 'collection', dynamicItems: true }),
    field('ai.providers', 'api-keys', { classification: 'secret' }),
    field('ai.providers', 'security-binding', { classification: 'secret' }),
  ]),
  ...domain('ai.models', [
    field('ai.models', 'items', { kind: 'collection', dynamicItems: true }),
    field('ai.models', 'default'),
  ]),
  ...domain('ai.chrome', [field('ai.chrome', 'enabled')]),
  ...domain('ai.prompts', [field('ai.prompts', 'global'), field('ai.prompts', 'scenario')]),
  ...domain('ai.prompt-templates', [
    field('ai.prompt-templates', 'items', { kind: 'collection', dynamicItems: true }),
  ]),
  ...domain('system.voice', [
    field('system.voice', 'language'),
    field('system.voice', 'mode'),
    field('system.voice', 'microphone', { classification: 'device-bound' }),
  ]),
  ...domain('system.native', [
    field('system.native', 'capture'),
    field('system.native', 'tray'),
    field('system.native', 'telemetry'),
    field('system.native', 'connection', { classification: 'action/status' }),
  ]),
] as const satisfies readonly SettingsTransferRegistryNode[];

export const SETTINGS_TRANSFER_REGISTRY_BY_ID = new Map(
  SETTINGS_TRANSFER_REGISTRY.map((node) => [node.id, node])
);

export const SETTINGS_TRANSFER_DOMAIN_IDS = SETTINGS_TRANSFER_REGISTRY.filter(
  (node) => node.parentId === null
).map((node) => node.id);

export function isTransferableSettingsNode(id: string): boolean {
  return SETTINGS_TRANSFER_REGISTRY_BY_ID.get(id)?.classification === 'transferable';
}
