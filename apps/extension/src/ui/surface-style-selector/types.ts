import type {
  SurfaceStyle,
  SurfaceStylePreset,
} from '@sniptale/runtime-contracts/highlighter/surface-style';

type SurfaceStylePresetOption = SurfaceStylePreset & {
  customized: boolean;
  enabled: boolean;
  favorite: boolean;
  isDefault: boolean;
  order: number;
};

export type SurfaceStyleSelectorActions = {
  onCreate: (name: string, style: SurfaceStyle) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  onDuplicate: (id: string, name: string) => Promise<boolean>;
  onRename: (id: string, name: string) => Promise<boolean>;
  onReorder: (ids: readonly string[]) => Promise<boolean>;
  onToggleFavorite: (id: string) => Promise<boolean>;
  onUpdate: (id: string, style: SurfaceStyle) => Promise<boolean>;
};

export type SurfaceStyleSelectorProps = {
  actions: SurfaceStyleSelectorActions;
  disabled?: boolean;
  presentation?: 'management' | 'selection';
  onChange: (style: SurfaceStyle) => void;
  onOpenChange?: (open: boolean) => void;
  presets: readonly SurfaceStylePresetOption[];
  value: SurfaceStyle;
};
