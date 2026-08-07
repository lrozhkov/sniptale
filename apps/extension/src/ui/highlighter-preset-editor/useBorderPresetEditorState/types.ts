import type { Dispatch, SetStateAction } from 'react';

import type {
  BorderPadding,
  BorderPreset,
  BorderPresetEffects,
} from '../../../features/highlighter/contracts';
import type { LinkedAnnotationTemplateOptions } from '../fields/inspector';

type BorderPresetStyle = 'solid' | 'dashed' | 'dotted';

export interface BorderPresetEditorProps {
  isSaving?: boolean;
  isOpen: boolean;
  onClose: () => void;
  onSave: (preset: BorderPreset) => void;
  preset?: BorderPreset;
  linkedTemplateOptions?: LinkedAnnotationTemplateOptions;
}

export interface BorderPresetDraftSetters {
  setColor: Dispatch<SetStateAction<string>>;
  setCustomCss: Dispatch<SetStateAction<string>>;
  setFillColor: Dispatch<SetStateAction<string>>;
  setFillOpacity: Dispatch<SetStateAction<number>>;
  setEffects: Dispatch<SetStateAction<BorderPresetEffects>>;
  setInheritCustomCss: Dispatch<SetStateAction<boolean>>;
  setName: Dispatch<SetStateAction<string>>;
  setOpacity: Dispatch<SetStateAction<number>>;
  setPadding: Dispatch<SetStateAction<BorderPadding>>;
  setRadius: Dispatch<SetStateAction<number>>;
  setShadow: Dispatch<SetStateAction<number>>;
  setStyle: Dispatch<SetStateAction<BorderPresetStyle>>;
  setTextareaHeight: Dispatch<SetStateAction<number>>;
  setStrokeOpacity: Dispatch<SetStateAction<number>>;
  setIsResizing: Dispatch<SetStateAction<boolean>>;
  setWidth: Dispatch<SetStateAction<number>>;
}

export interface BorderPresetDraftState extends BorderPresetDraftSetters {
  color: string;
  customCss: string;
  fillColor: string;
  fillOpacity: number;
  effects: BorderPresetEffects;
  inheritCustomCss: boolean;
  isResizing: boolean;
  name: string;
  opacity: number;
  padding: BorderPadding;
  radius: number;
  shadow: number;
  style: BorderPresetStyle;
  textareaHeight: number;
  strokeOpacity: number;
  width: number;
}

export interface BorderPresetCssValidation {
  cssError: string | null;
  hasBlockedProps: boolean;
}
