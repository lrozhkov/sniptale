export const glassPopoverToolbarFormColorStyles = `
.sniptale-glass-color-row { display: flex; flex-direction: column; gap: 10px; }
.sniptale-glass-color-control { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.sniptale-glass-color-label { font-size: 12px; color: var(--sniptale-color-text-dim); }
.sniptale-glass-color-line { display: flex; align-items: center; gap: 8px; }
.sniptale-glass-color-label--inline { width: 34px; flex: 0 0 34px; }
.sniptale-glass-color-line-main { min-width: 0; flex: 1; display: flex; align-items: center; gap: 8px; }

.sniptale-glass-color-trigger {
  min-height: 36px;
  min-width: 52px;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  flex: 0 0 52px;
}

.sniptale-glass-color-trigger--disabled,
.sniptale-glass-color-palette--disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.sniptale-glass-color-swatch {
  width: 20px;
  height: 20px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--sniptale-color-text-inverse) 22%, transparent);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--sniptale-color-text-inverse) 12%, transparent),
    0 1px 2px color-mix(in srgb, var(--sniptale-color-shadow-strong) 20%, transparent);
}

.sniptale-glass-color-value { font-size: 12px; color: var(--sniptale-color-text-secondary); text-transform: uppercase; }
.sniptale-glass-color-native { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.sniptale-glass-color-palette { display: flex; flex-wrap: nowrap; gap: 6px; }

.sniptale-glass-color-option {
  width: 16px;
  height: 16px;
  padding: 0;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--sniptale-color-text-inverse) 20%, transparent);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--sniptale-color-text-inverse) 16%, transparent),
    0 1px 2px color-mix(in srgb, var(--sniptale-color-shadow-strong) 20%, transparent);
  cursor: pointer;
}

.sniptale-glass-color-option:hover { transform: translateY(-1px); }
.sniptale-glass-color-option:disabled { cursor: not-allowed; }

.sniptale-glass-color-option--active {
  border-color: color-mix(in srgb, var(--sniptale-color-text-inverse) 92%, transparent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--sniptale-color-accent) 18%, transparent);
}

.sniptale-glass-hidden-color {
  position: relative;
  overflow: hidden;
}
`;
