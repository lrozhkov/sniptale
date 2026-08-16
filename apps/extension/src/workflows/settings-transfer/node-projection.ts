import type { SettingsTransferConflict } from '../../contracts/settings-transfer';
import { SETTINGS_TRANSFER_DOMAIN_IDS } from './registry';

const itemCollections: ReadonlyArray<{
  storagePath: string;
  treePath: string;
  itemPrefix?: string;
}> = [
  { storagePath: 'capture.quick-actions.items', treePath: 'capture.quick-actions.items' },
  { storagePath: 'capture.viewport-presets.items', treePath: 'capture.viewport-presets.items' },
  { storagePath: 'capture.video.profiles', treePath: 'capture.video.profiles' },
  { storagePath: 'capture.saving.templates', treePath: 'capture.saving.templates' },
  { storagePath: 'styles.borders.borderPresets', treePath: 'styles.borders.items' },
  { storagePath: 'styles.callouts.presets', treePath: 'styles.callouts.items' },
  { storagePath: 'styles.numbering.presets', treePath: 'styles.numbering.items' },
  { storagePath: 'styles.tags.tags', treePath: 'styles.tags.items' },
  {
    storagePath: 'styles.tool-presets.step.presets',
    treePath: 'styles.tool-presets.items',
    itemPrefix: 'step:',
  },
  {
    storagePath: 'styles.tool-presets.sceneBackground.presets',
    treePath: 'styles.tool-presets.items',
    itemPrefix: 'sceneBackground:',
  },
  { storagePath: 'styles.surfaces.presets', treePath: 'styles.surfaces.items' },
  { storagePath: 'styles.gradients.presets', treePath: 'styles.gradients.items' },
  { storagePath: 'ai.providers.items', treePath: 'ai.providers.items' },
  { storagePath: 'ai.models.items', treePath: 'ai.models.items' },
  { storagePath: 'ai.prompt-templates.items', treePath: 'ai.prompt-templates.items' },
];

export function projectSettingsTransferConflictNodeId(
  path: string,
  kind: SettingsTransferConflict['kind']
): string {
  if (kind === 'item') {
    const collection = itemCollections.find(({ storagePath }) =>
      path.startsWith(`${storagePath}.`)
    );
    if (collection) {
      const itemId = path.slice(collection.storagePath.length + 1);
      return `${collection.treePath}.${collection.itemPrefix ?? ''}${itemId}`;
    }
  }
  const palettePrefix = 'styles.palettes.slots.';
  if (path.startsWith(palettePrefix)) {
    return `styles.palettes.items.${path.slice(palettePrefix.length)}`;
  }
  const domainId = SETTINGS_TRANSFER_DOMAIN_IDS.find((id) => path.startsWith(`${id}.`));
  if (!domainId) return path;
  const field = path.slice(domainId.length + 1).split('.')[0] ?? '';
  return `${domainId}.${normalizeSettingsTransferRegistryField(domainId, field)}`;
}

export function normalizeSettingsTransferRegistryField(domainId: string, field: string): string {
  if (['borderPresets', 'presets', 'tags'].includes(field)) return 'items';
  if (domainId === 'interface.preferences' && field === 'popupStartup') return 'popup-startup';
  if (domainId === 'interface.preferences' && field === 'contextMenu') return 'context-menu';
  if (domainId === 'capture.viewport-presets' && field === 'defaultId') return 'default';
  if (domainId === 'capture.video' && field === 'qualityProfileId') return 'selection';
  if (domainId === 'capture.video' && field === 'outputProfile') return 'output';
  if (domainId === 'capture.after-capture' && field === 'action') return 'action';
  if (domainId === 'capture.saving' && field.startsWith('default')) return 'defaults';
  if (domainId === 'capture.retention' && field === 'policy') return 'policy';
  if (
    ['styles.borders', 'styles.callouts', 'styles.numbering'].includes(domainId) &&
    field !== 'borderPresets' &&
    field !== 'presets'
  )
    return 'defaults';
  if (domainId === 'styles.tags' && field !== 'tags') return 'active-filter';
  if (domainId === 'styles.tool-presets' && (field === 'step' || field === 'sceneBackground'))
    return 'items';
  if (domainId === 'ai.models' && field === 'defaultModelId') return 'default';
  if (domainId === 'ai.prompt-templates' && field === 'order') return 'items';
  if (domainId === 'styles.palettes' && field === 'slots') return 'items';
  return field;
}
