import type { Dispatch, SetStateAction } from 'react';

import type {
  BorderPadding,
  BorderPreset,
  BorderPresetEffects,
} from '../../../features/highlighter/contracts';
import type { LinkedAnnotationTemplateOptions } from '../fields/inspector';
import type { Paint } from '@sniptale/foundation/paint';

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
  setFillPaint: Dispatch<SetStateAction<Paint>>;
  setEffects: Dispatch<SetStateAction<BorderPresetEffects>>;
  setInheritCustomCss: Dispatch<SetStateAction<boolean>>;
  setName: Dispatch<SetStateAction<string>>;
  setPadding: Dispatch<SetStateAction<BorderPadding>>;
  setRadius: Dispatch<SetStateAction<number>>;
  setShadow: Dispatch<SetStateAction<number>>;
  setStyle: Dispatch<SetStateAction<BorderPresetStyle>>;
  setTextareaHeight: Dispatch<SetStateAction<number>>;
  setIsResizing: Dispatch<SetStateAction<boolean>>;
  setWidth: Dispatch<SetStateAction<number>>;
}

export interface BorderPresetDraftState extends BorderPresetDraftSetters {
  color: string;
  customCss: string;
  fillPaint: Paint;
  effects: BorderPresetEffects;
  inheritCustomCss: boolean;
  isResizing: boolean;
  name: string;
  padding: BorderPadding;
  radius: number;
  shadow: number;
  style: BorderPresetStyle;
  textareaHeight: number;
  width: number;
}

export interface BorderPresetCssValidation {
  cssError: string | null;
  hasBlockedProps: boolean;
}
