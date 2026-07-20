import { Monitor } from 'lucide-react';

import type { ViewportPreset } from '../../../../../contracts/settings';

const presetIconClassName = [
  'flex h-8 w-8 items-center justify-center rounded-[10px] border',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_84%,transparent)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_76%,transparent)]',
  'text-[var(--sniptale-color-text-muted-strong)]',
].join(' ');

export function PresetRowMeta(props: { preset: ViewportPreset }) {
  return (
    <>
      <div className={presetIconClassName}>
        <Monitor size={14} />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium text-[var(--sniptale-color-text-primary)]">
          {props.preset.label}
        </div>
        <div className="font-mono text-xs text-[var(--sniptale-color-text-dim)]">
          {props.preset.width} × {props.preset.height}
        </div>
      </div>
    </>
  );
}
