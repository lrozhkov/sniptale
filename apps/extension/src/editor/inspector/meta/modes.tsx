import { translate, type TranslationKey } from '../../../platform/i18n';
import {
  FolderOpen,
  Globe,
  Grid2x2,
  Info,
  LayoutPanelTop,
  Move,
  Palette,
  Scaling,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { EditorLayerEffectCategory } from '../../../features/editor/document/effects';
import type { EditorInspector } from '../../state/types';
import { createInspectorMeta, type EditorInspectorMeta } from './shared';

const ICON_PROPS = { size: 18, strokeWidth: 2 } as const;

interface TranslatedInspectorDescriptor {
  Icon: LucideIcon;
  subtitleKey: TranslationKey;
  titleKey: TranslationKey;
}

const staticInspectorDescriptors = {
  'browser-frame': {
    Icon: Globe,
    subtitleKey: 'editor.toolbar.browserSubtitle',
    titleKey: 'editor.toolbar.browserTitle',
  },
  'canvas-size': {
    Icon: Scaling,
    subtitleKey: 'editor.toolbar.resizeSubtitle',
    titleKey: 'editor.toolbar.resizeTitle',
  },
  file: {
    Icon: FolderOpen,
    subtitleKey: 'editor.toolbar.fileSubtitle',
    titleKey: 'editor.toolbar.fileTitle',
  },
  frame: {
    Icon: LayoutPanelTop,
    subtitleKey: 'editor.toolbar.frameSubtitle',
    titleKey: 'editor.toolbar.frameTitle',
  },
  grid: {
    Icon: Grid2x2,
    subtitleKey: 'editor.toolbar.gridSubtitle',
    titleKey: 'editor.toolbar.gridTitle',
  },
  'image-size': {
    Icon: Scaling,
    subtitleKey: 'editor.toolbar.imageSizeSubtitle',
    titleKey: 'editor.toolbar.imageSizeTitle',
  },
  meta: {
    Icon: Info,
    subtitleKey: 'editor.toolbar.metaSubtitle',
    titleKey: 'editor.toolbar.metaTitle',
  },
  workspace: {
    Icon: Palette,
    subtitleKey: 'editor.toolbar.workspaceSubtitle',
    titleKey: 'editor.toolbar.workspaceTitle',
  },
} satisfies Partial<Record<EditorInspector, TranslatedInspectorDescriptor>>;

const layerEffectsDescriptors = {
  adjustments: {
    Icon: SlidersHorizontal,
    subtitleKey: 'editor.toolbar.layerEffectsAdjustmentsSubtitle',
    titleKey: 'editor.toolbar.layerEffectsAdjustments',
  },
  filters: {
    Icon: Sparkles,
    subtitleKey: 'editor.toolbar.layerEffectsFiltersSubtitle',
    titleKey: 'editor.toolbar.layerEffectsFilters',
  },
  transformations: {
    Icon: Move,
    subtitleKey: 'editor.toolbar.layerEffectsTransformationsSubtitle',
    titleKey: 'editor.toolbar.layerEffectsTransformations',
  },
} satisfies Record<
  EditorLayerEffectCategory,
  Pick<TranslatedInspectorDescriptor, 'Icon' | 'subtitleKey' | 'titleKey'>
>;

const defaultLayerEffectsDescriptor = {
  Icon: Sparkles,
  subtitleKey: 'editor.toolbar.layerEffectsSubtitle',
  titleKey: 'editor.toolbar.layerEffectsTitle',
} satisfies Pick<TranslatedInspectorDescriptor, 'Icon' | 'subtitleKey' | 'titleKey'>;

function renderIcon(Icon: LucideIcon) {
  return <Icon {...ICON_PROPS} />;
}

function createTranslatedInspectorMeta(
  descriptor: TranslatedInspectorDescriptor
): EditorInspectorMeta {
  return createInspectorMeta(
    translate(descriptor.titleKey),
    translate(descriptor.subtitleKey),
    renderIcon(descriptor.Icon)
  );
}

export function getInspectorModeMeta(
  inspector: EditorInspector,
  options?: { layerEffectsCategory?: EditorLayerEffectCategory }
): EditorInspectorMeta | null {
  if (inspector === 'layer-effects') {
    const descriptor = options?.layerEffectsCategory
      ? layerEffectsDescriptors[options.layerEffectsCategory]
      : defaultLayerEffectsDescriptor;
    return createInspectorMeta(
      translate(descriptor.titleKey),
      translate(descriptor.subtitleKey),
      renderIcon(descriptor.Icon)
    );
  }

  const descriptor =
    staticInspectorDescriptors[inspector as keyof typeof staticInspectorDescriptors];
  if (descriptor) {
    return createTranslatedInspectorMeta(descriptor);
  }

  return null;
}
