import type { Dispatch, SetStateAction } from 'react';

import type { BorderPadding, BorderPreset } from '../../../../../features/highlighter/contracts';

type BorderPresetStyle = 'solid' | 'dashed' | 'dotted';

export interface BorderPresetEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (preset: BorderPreset) => void;
  preset?: BorderPreset;
}

export interface BorderPresetDraftSetters {
  setColor: Dispatch<SetStateAction<string>>;
  setCustomCss: Dispatch<SetStateAction<string>>;
  setFillColor: Dispatch<SetStateAction<string>>;
  setFillOpacity: Dispatch<SetStateAction<number>>;
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
