import React from 'react';
import { translate } from '../../platform/i18n';
import {
  ArrowRight,
  Crop,
  Droplet,
  FileImage,
  Hash,
  Highlighter,
  Image as ImageIcon,
  Layers3,
  MousePointer2,
  PencilLine,
  Shapes,
  SquareDashed,
  Type,
  Wallpaper,
} from 'lucide-react';
import type { EditorObjectType, EditorTool } from '../../features/editor/document/types';

type ToolIconComponent = typeof MousePointer2;

const TOOL_LABEL_KEYS = {
  select: 'editor.tools.select',
  pencil: 'editor.tools.pencil',
  marker: 'editor.tools.highlighter',
  'frame-annotation': 'editor.tools.frameAnnotation',
  shape: 'editor.tools.shape',
  blur: 'editor.tools.blur',
  arrow: 'editor.tools.arrow',
  text: 'editor.tools.text',
  step: 'editor.tools.step',
  image: 'editor.tools.image',
  crop: 'editor.tools.crop',
} satisfies Partial<Record<EditorTool, string>>;

const TOOL_ICON_COMPONENTS = {
  select: MousePointer2,
  pencil: PencilLine,
  marker: Highlighter,
  'frame-annotation': SquareDashed,
  shape: Shapes,
  blur: Droplet,
  arrow: ArrowRight,
  text: Type,
  step: Hash,
  image: ImageIcon,
  crop: Crop,
} satisfies Record<EditorTool, ToolIconComponent>;

const OBJECT_TYPE_TO_TOOL = {
  'transparent-base': 'select',
  background: 'select',
  'browser-frame': 'select',
  pencil: 'pencil',
  marker: 'marker',
  'frame-annotation': 'frame-annotation',
  shape: 'shape',
  blur: 'blur',
  arrow: 'arrow',
  text: 'text',
  step: 'step',
  image: 'image',
  'source-image': 'image',
  'meta-stamp': 'text',
  'rich-shape': 'shape',
} satisfies Partial<Record<EditorObjectType, EditorTool>>;

const LAYER_ICON_COMPONENTS = {
  'browser-frame': Layers3,
  background: Wallpaper,
  'transparent-base': Layers3,
  'source-image': FileImage,
  image: FileImage,
  'meta-stamp': Type,
} satisfies Partial<Record<EditorObjectType, ToolIconComponent>>;

function renderToolIcon(tool: EditorTool, size = 18): React.ReactNode {
  const Icon = TOOL_ICON_COMPONENTS[tool];
  return <Icon size={size} strokeWidth={2} />;
}

function renderObjectTypeIcon(type: EditorObjectType, size = 17): React.ReactNode | null {
  if (!(type in LAYER_ICON_COMPONENTS)) {
    return null;
  }

  const Icon = LAYER_ICON_COMPONENTS[type as keyof typeof LAYER_ICON_COMPONENTS];
  return Icon ? <Icon size={size} strokeWidth={2} /> : null;
}

export const TOOL_ORDER: EditorTool[] = [
  'select',
  'pencil',
  'marker',
  'frame-annotation',
  'shape',
  'blur',
  'text',
  'arrow',
  'step',
];

export const RASTER_TOOL_ORDER: EditorTool[] = [];

export function getToolLabel(tool: EditorTool): string {
  const key = TOOL_LABEL_KEYS[tool];
  return key ? translate(key as Parameters<typeof translate>[0]) : tool;
}

export const TOOL_ICONS: Record<EditorTool, React.ReactNode> = {
  arrow: renderToolIcon('arrow'),
  blur: renderToolIcon('blur'),
  crop: renderToolIcon('crop'),
  marker: renderToolIcon('marker'),
  'frame-annotation': renderToolIcon('frame-annotation'),
  image: renderToolIcon('image'),
  pencil: renderToolIcon('pencil'),
  select: renderToolIcon('select'),
  shape: renderToolIcon('shape'),
  step: renderToolIcon('step'),
  text: renderToolIcon('text'),
};

export function mapObjectTypeToTool(type: EditorObjectType | null): EditorTool {
  if (type === null) {
    return 'select';
  }

  return OBJECT_TYPE_TO_TOOL[type] ?? 'select';
}

export function getLayerIcon(type: EditorObjectType): React.ReactNode {
  const directIcon = renderObjectTypeIcon(type);
  return directIcon ?? TOOL_ICONS[mapObjectTypeToTool(type)] ?? TOOL_ICONS.select;
}
