export const WORKSPACE_BACKGROUND_PALETTE = [
  '#f2f4f7',
  '#fafafa',
  '#f4f4f5',
  '#f5f5f4',
  '#f3f0ea',
  '#e7e5e4',
  '#e4e4e7',
  '#d6d3d1',
  '#d4d4d8',
  '#a8a29e',
  '#a1a1aa',
  '#78716c',
  '#71717a',
  '#44403c',
  '#3f3f46',
  '#27272a',
] as const;

export const GRID_COLOR_PALETTE = [
  '#f4f4f5',
  '#e4e4e7',
  '#d4d4d8',
  '#a1a1aa',
  '#94a3b8',
  '#71717a',
  '#64748b',
  '#52525b',
  '#475569',
  '#3f3f46',
  '#334155',
  '#27272a',
  '#18181b',
  '#111827',
] as const;

interface BackgroundGradientPresetData {
  angle: number;
  from: string;
  id: string;
  labelKey:
    | 'editor.compact.gradientOcean'
    | 'editor.compact.gradientSunset'
    | 'editor.compact.gradientAurora'
    | 'editor.compact.gradientMint'
    | 'editor.compact.gradientEmber'
    | 'editor.compact.gradientSlate';
  to: string;
}

export const FRAME_GRADIENT_PRESET_DATA: readonly BackgroundGradientPresetData[] = [
  {
    id: 'ocean',
    labelKey: 'editor.compact.gradientOcean',
    from: '#09090b',
    to: '#2563eb',
    angle: 135,
  },
  {
    id: 'sunset',
    labelKey: 'editor.compact.gradientSunset',
    from: '#f97316',
    to: '#ec4899',
    angle: 135,
  },
  {
    id: 'aurora',
    labelKey: 'editor.compact.gradientAurora',
    from: '#27272a',
    to: '#14b8a6',
    angle: 140,
  },
  {
    id: 'mint',
    labelKey: 'editor.compact.gradientMint',
    from: '#0f766e',
    to: '#22c55e',
    angle: 135,
  },
  {
    id: 'ember',
    labelKey: 'editor.compact.gradientEmber',
    from: '#7c2d12',
    to: '#f59e0b',
    angle: 145,
  },
  {
    id: 'slate',
    labelKey: 'editor.compact.gradientSlate',
    from: '#18181b',
    to: '#52525b',
    angle: 135,
  },
] as const;
