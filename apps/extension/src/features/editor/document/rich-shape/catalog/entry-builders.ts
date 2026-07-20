import type { TranslationKey } from '../../../../../platform/i18n/types';
import type {
  EditorBuiltInShapeCapability,
  EditorBuiltInShapeCatalogEntry,
  EditorBuiltInShapeCategory,
  EditorBuiltInShapeGeometryDefinition,
} from './types';
import type { EditorRichShapeFamily } from './families';

const INSERT_FRAME_DEFAULTS = { left: 0, top: 0, width: 160, height: 100 } as const;
const INSERT_STYLE_DEFAULTS = {
  fillColor: '#ffffff',
  fillTransparency: 1,
  lineColor: '#111827',
  lineWidth: 2,
  opacity: 1,
  cornerRadius: 0,
} as const;
const INSERT_TEXT_DEFAULTS = {
  content: '',
  fontSize: 16,
  horizontalAlign: 'center',
  verticalAlign: 'middle',
} as const;
const INSERT_EFFECT_DEFAULTS = { shadowEnabled: false } as const;

interface EntryOptions {
  id: string;
  label: string;
  category: EditorBuiltInShapeCategory;
  family: EditorRichShapeFamily;
  kind: string;
  geometry: EditorBuiltInShapeGeometryDefinition;
  aliases: readonly string[];
  tags?: readonly string[];
  compatibilityIds?: readonly string[];
  capabilities?: readonly EditorBuiltInShapeCapability[];
}

export function defineShapeEntry(options: EntryOptions): EditorBuiltInShapeCatalogEntry {
  return {
    id: options.id,
    labelKey: `editor.shapeCatalog.labels.${options.id}` as TranslationKey,
    labelFallback: options.label,
    category: options.category,
    tags: options.tags ?? [],
    searchAliases: options.aliases,
    ...(options.compatibilityIds ? { compatibilityIds: options.compatibilityIds } : {}),
    thumbnail: options.geometry,
    insertDefaults: {
      shapeFamily: options.family,
      shapeKind: options.kind,
      frame: INSERT_FRAME_DEFAULTS,
      style: INSERT_STYLE_DEFAULTS,
      text: INSERT_TEXT_DEFAULTS,
      effects: INSERT_EFFECT_DEFAULTS,
    },
    capabilities: options.capabilities ?? ['fill', 'line', 'text', 'effects'],
    geometry: options.geometry,
  };
}
