import {
  CopyColor,
  HexValue,
} from '../../../apps/extension/src/ui/color-selector/inspector-color-value';
import { getColorAlpha, setColorAlpha } from '@sniptale/foundation/color';
import { useRef, useState } from 'react';
import { InspectorColorPicker } from './inspector-color-picker';
import type { InspectorCopy } from './inspector-copy';
import { ColorAlphaValue } from '../../../apps/extension/src/ui/color-selector/inspector-alpha-value';

export function InspectorColorField({
  copy,
  palette,
  initialValue,
  allowAlpha = false,
  onVisibleColorChange,
}: {
  copy: InspectorCopy;
  palette: readonly string[];
  initialValue: string;
  allowAlpha?: boolean;
  onVisibleColorChange?: (value: string) => void;
}) {
  const [color, setColor] = useState(initialValue);
  const [preview, setPreview] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const errorTarget = useRef<HTMLDivElement>(null);
  const visible = preview ?? color;
  const hex = (setColorAlpha(visible, 1) ?? visible).toUpperCase();
  const label = allowAlpha ? copy.colorWithAlpha : copy.color;
  const copyValue = allowAlpha && color.length === 7 ? color + 'FF' : color;

  const showPreview = (value: string | null) => {
    setPreview(value);
    onVisibleColorChange?.(value ?? color);
  };
  const commit = (value: string) => {
    setColor(value);
    setPreview(null);
    onVisibleColorChange?.(value);
  };

  return (
    <div className="parameter color-row">
      <div className="color-row-name">
        <span className="param-name">{label}</span>
        <CopyColor copy={copy} label={copy.copyHex} value={copyValue.toUpperCase()} />
      </div>
      <div
        className={allowAlpha ? 'color-field color-alpha-field' : 'color-field solid-color-field'}
        data-open={open}
      >
        <div className="color-frame" ref={frame}>
          <InspectorColorPicker
            anchorRef={frame}
            label={label}
            value={color}
            allowAlpha={allowAlpha}
            palette={palette}
            onOpenChange={setOpen}
            onChange={commit}
            onPreviewChange={showPreview}
            onPreviewReset={() => showPreview(null)}
          />
          <HexValue
            key={open ? 'hex-picker' : 'hex-inline'}
            value={hex}
            disabled={open}
            invalid={copy.invalidHex}
            errorTarget={errorTarget}
            label={allowAlpha ? copy.colorWithAlphaHex : copy.colorHex}
            onCommit={(parsed) => {
              if (allowAlpha && parsed.hasAlpha) {
                commit(parsed.color);
                return;
              }
              const next = setColorAlpha(
                parsed.color,
                allowAlpha ? (getColorAlpha(color) ?? 1) : 1
              );
              if (next) commit(next);
            }}
          />
          {allowAlpha && (
            <ColorAlphaValue
              key={open ? 'alpha-picker' : 'alpha-inline'}
              copy={copy}
              errorTarget={errorTarget}
              disabled={open}
              value={Math.round((getColorAlpha(visible) ?? 1) * 100)}
              onChange={(value) => {
                const next = setColorAlpha(color, value / 100);
                if (next) commit(next);
              }}
            />
          )}
        </div>
        <div ref={errorTarget} />
      </div>
    </div>
  );
}
