import {
  ArrowRight,
  Circle,
  Code2,
  Diamond,
  Droplet,
  Eraser,
  FileAudio,
  FileVideo,
  Grid3X3,
  Hash,
  Highlighter,
  Image as ImageIcon,
  LayoutTemplate,
  Magnet,
  Mic,
  MousePointer2,
  PanelRightClose,
  PanelRightOpen,
  PaintBucket,
  Paintbrush,
  PencilLine,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Square,
  SquareDashed,
  MessageSquareText,
  Minus,
  Shapes,
  Type,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { CanvasInsertIntent } from '@sniptale/runtime-contracts/canvas-tools';
import type { CanvasToolAction } from './types';

export type CanvasToolDescriptorKind =
  | 'add-slide'
  | 'annotation'
  | 'arrow'
  | 'audio'
  | 'blur'
  | 'brush'
  | 'callout'
  | 'code'
  | 'diamond'
  | 'ellipse'
  | 'eraser'
  | 'fill'
  | 'grid'
  | 'highlighter'
  | 'image'
  | 'inspector-collapse'
  | 'inspector-expand'
  | 'layout'
  | 'line'
  | 'magnet'
  | 'pencil'
  | 'rectangle'
  | 'record-audio'
  | 'rough-shape'
  | 'scene'
  | 'select'
  | 'selection'
  | 'shape'
  | 'shape-library'
  | 'shapes-and-lines'
  | 'step'
  | 'text'
  | 'video'
  | 'workspace';

export type CanvasToolActionDescriptor = Omit<CanvasToolAction, 'icon'> & {
  icon?: ReactNode;
  kind: CanvasToolDescriptorKind;
};

type CanvasFileToolActionDescriptor = Omit<CanvasToolActionDescriptor, 'onSelect'> & {
  accept: string;
  onSelect?: CanvasToolAction['onSelect'];
  onSelectFile: NonNullable<CanvasToolAction['onSelectFile']>;
};

type CanvasInsertToolActionDescriptor<TTarget extends string> = Omit<
  CanvasToolActionDescriptor,
  'id' | 'kind' | 'onSelect'
> & {
  id?: string;
  intent: CanvasInsertIntent<TTarget>;
  onSelect: (intent: CanvasInsertIntent<TTarget>) => void;
};

type CanvasFileInsertToolActionDescriptor<TTarget extends string> = Omit<
  CanvasInsertToolActionDescriptor<TTarget>,
  'onSelect'
> & {
  accept: string;
  onSelectFile: NonNullable<CanvasToolAction['onSelectFile']>;
};

const CANVAS_TOOL_ICON_BY_KIND = {
  'add-slide': <Plus size={18} strokeWidth={2} />,
  annotation: <Sparkles size={18} strokeWidth={2} />,
  arrow: <ArrowRight size={18} strokeWidth={2} />,
  audio: <FileAudio size={18} strokeWidth={2} />,
  blur: <Droplet size={18} strokeWidth={2} />,
  brush: <Paintbrush size={18} strokeWidth={2} />,
  callout: <MessageSquareText size={18} strokeWidth={2} />,
  code: <Code2 size={18} strokeWidth={2} />,
  diamond: <Diamond size={18} strokeWidth={2} />,
  ellipse: <Circle size={18} strokeWidth={2} />,
  eraser: <Eraser size={18} strokeWidth={2} />,
  fill: <PaintBucket size={18} strokeWidth={2} />,
  grid: <Grid3X3 size={18} strokeWidth={2} />,
  highlighter: <Highlighter size={18} strokeWidth={2} />,
  image: <ImageIcon size={18} strokeWidth={2} />,
  'inspector-collapse': <PanelRightClose size={18} strokeWidth={2} />,
  'inspector-expand': <PanelRightOpen size={18} strokeWidth={2} />,
  layout: <LayoutTemplate size={18} strokeWidth={2} />,
  line: <Minus size={18} strokeWidth={2} />,
  magnet: <Magnet size={18} strokeWidth={2} />,
  pencil: <PencilLine size={18} strokeWidth={2} />,
  rectangle: <Square size={18} strokeWidth={2} />,
  'record-audio': <Mic size={18} strokeWidth={2} />,
  'rough-shape': <Shapes size={18} strokeWidth={2} />,
  scene: <MousePointer2 size={18} strokeWidth={2} />,
  select: <MousePointer2 size={18} strokeWidth={2} />,
  selection: <SquareDashed size={18} strokeWidth={2} />,
  shape: <Square size={18} strokeWidth={2} />,
  'shape-library': <Shapes size={18} strokeWidth={2} />,
  'shapes-and-lines': <Shapes size={18} strokeWidth={2} />,
  step: <Hash size={18} strokeWidth={2} />,
  text: <Type size={18} strokeWidth={2} />,
  video: <FileVideo size={18} strokeWidth={2} />,
  workspace: <SlidersHorizontal size={18} strokeWidth={2} />,
} satisfies Record<CanvasToolDescriptorKind, ReactNode>;

export function createCanvasToolAction(descriptor: CanvasToolActionDescriptor): CanvasToolAction {
  const { icon, kind, ...action } = descriptor;
  return {
    ...action,
    icon: icon ?? CANVAS_TOOL_ICON_BY_KIND[kind],
  };
}

export function createCanvasFileToolAction(
  descriptor: CanvasFileToolActionDescriptor
): CanvasToolAction {
  return createCanvasToolAction({
    ...descriptor,
    onSelect: descriptor.onSelect ?? (() => undefined),
  });
}

export function createCanvasInsertToolAction<TTarget extends string>(
  descriptor: CanvasInsertToolActionDescriptor<TTarget>
): CanvasToolAction {
  const { id, intent, onSelect, ...action } = descriptor;
  return createCanvasToolAction({
    ...action,
    id: id ?? intent.target,
    kind: intent.kind,
    onSelect: () => onSelect(intent),
  });
}

export function createCanvasFileInsertToolAction<TTarget extends string>(
  descriptor: CanvasFileInsertToolActionDescriptor<TTarget>
): CanvasToolAction {
  const { id, intent, ...action } = descriptor;
  return createCanvasFileToolAction({
    ...action,
    id: id ?? intent.target,
    kind: intent.kind,
    onSelectFile: action.onSelectFile,
  });
}
