import React from 'react';
import { translate } from '../../platform/i18n';
import {
  ArrowRight,
  Circle,
  Crop,
  Diamond,
  Droplet,
  Eraser,
  FileImage,
  Hash,
  Highlighter,
  Image as ImageIcon,
  Layers3,
  MessageSquareText,
  Minus,
  MousePointer2,
  PaintBucket,
  Paintbrush,
  PencilLine,
  Shapes,
  SquareDashed,
  Square,
  Type,
  Wallpaper,
} from 'lucide-react';
import type { EditorObjectType, EditorTool } from '../../features/editor/document/types';

type ToolIconComponent = typeof MousePointer2;

const TOOL_LABEL_KEYS = {
  select: 'editor.tools.select',
  selection: 'editor.tools.selection',
  brush: 'editor.tools.brush',
  eraser: 'editor.tools.eraser',
  fill: 'editor.tools.fill',
  pencil: 'editor.tools.pencil',
  highlighter: 'editor.tools.highlighter',
  'shapes-and-lines': 'editor.tools.shapesAndLines',
  'rough-shape': 'editor.tools.roughShape',
  'shape-library': 'editor.tools.shapeLibrary',
  rectangle: 'editor.tools.rectangle',
  ellipse: 'editor.tools.ellipse',
  blur: 'editor.tools.blur',
  diamond: 'editor.tools.diamond',
  arrow: 'editor.tools.arrow',
  line: 'editor.tools.line',
  callout: 'editor.tools.callout',
  text: 'editor.tools.text',
  step: 'editor.tools.step',
  image: 'editor.tools.image',
  crop: 'editor.tools.crop',
} satisfies Partial<Record<EditorTool, string>>;

const TOOL_ICON_COMPONENTS = {
  select: MousePointer2,
  selection: SquareDashed,
  brush: Paintbrush,
  eraser: Eraser,
  fill: PaintBucket,
  pencil: PencilLine,
  highlighter: Highlighter,
  'shapes-and-lines': Shapes,
  'rough-shape': Shapes,
  'shape-library': Shapes,
  rectangle: Square,
  ellipse: Circle,
  blur: Droplet,
  diamond: Diamond,
  arrow: ArrowRight,
  line: Minus,
  callout: MessageSquareText,
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
  highlighter: 'highlighter',
  rectangle: 'rectangle',
  ellipse: 'ellipse',
  blur: 'blur',
  diamond: 'diamond',
  arrow: 'arrow',
  line: 'line',
  text: 'text',
  step: 'step',
  image: 'image',
  'source-image': 'image',
  'meta-stamp': 'text',
  'rich-shape': 'shapes-and-lines',
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
  'highlighter',
  'blur',
  'text',
  'callout',
  'arrow',
  'line',
  'shapes-and-lines',
  'step',
];

export const RASTER_TOOL_ORDER: EditorTool[] = ['selection', 'brush', 'eraser', 'fill'];

export function getToolLabel(tool: EditorTool): string {
  const key = TOOL_LABEL_KEYS[tool];
  return key ? translate(key as Parameters<typeof translate>[0]) : tool;
}

export const TOOL_ICONS: Record<EditorTool, React.ReactNode> = {
  arrow: renderToolIcon('arrow'),
  blur: renderToolIcon('blur'),
  brush: renderToolIcon('brush'),
  callout: renderToolIcon('callout'),
  crop: renderToolIcon('crop'),
  diamond: renderToolIcon('diamond'),
  ellipse: renderToolIcon('ellipse'),
  eraser: renderToolIcon('eraser'),
  fill: renderToolIcon('fill'),
  highlighter: renderToolIcon('highlighter'),
  image: renderToolIcon('image'),
  line: renderToolIcon('line'),
  pencil: renderToolIcon('pencil'),
  rectangle: renderToolIcon('rectangle'),
  'rough-shape': renderToolIcon('rough-shape'),
  select: renderToolIcon('select'),
  selection: renderToolIcon('selection'),
  'shape-library': renderToolIcon('shape-library'),
  'shapes-and-lines': renderToolIcon('shapes-and-lines'),
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
