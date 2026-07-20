export const glassPopoverToolbarFormInputStyles = `
.sniptale-glass-switch {
  width: 38px;
  height: 22px;
  border-radius: 9999px;
  border: 1px solid color-mix(in srgb, var(--sniptale-color-border-strong) 68%, transparent);
  background: color-mix(
    in srgb,
    var(--sniptale-color-surface-canvas) 6%,
    var(--sniptale-color-surface-panel) 94%
  );
  padding: 2px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
}

.sniptale-glass-switch--on {
  justify-content: flex-end;
  border-color: color-mix(in srgb, var(--sniptale-color-accent) 45%, transparent);
  background: color-mix(in srgb, var(--sniptale-color-accent) 16%, transparent);
}

.sniptale-glass-switch-thumb {
  width: 16px;
  height: 16px;
  border-radius: 9999px;
  background: var(--sniptale-color-toggle-thumb);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--sniptale-color-shadow-strong) 32%, transparent);
}

.sniptale-glass-range {
  --sniptale-range-fill-ratio: 0%;
  --sniptale-range-thumb-size: 18px;
  --sniptale-range-track-height: 8px;
  width: 100%;
  -webkit-appearance: none;
  appearance: none;
  background: transparent;
  cursor: pointer;
}

.sniptale-glass-range::-webkit-slider-runnable-track {
  height: var(--sniptale-range-track-height);
  border-radius: 9999px;
  border: 1px solid color-mix(in srgb, var(--sniptale-color-border-strong) 72%, transparent);
  background:
    linear-gradient(
      90deg,
      color-mix(in srgb, var(--sniptale-color-accent) 78%, white 22%) 0,
      color-mix(in srgb, var(--sniptale-color-accent) 78%, white 22%) var(--sniptale-range-fill-ratio),
      transparent var(--sniptale-range-fill-ratio),
      transparent 100%
    ),
    linear-gradient(
      180deg,
      color-mix(in srgb, white 8%, transparent),
      color-mix(in srgb, var(--sniptale-color-surface-canvas) 10%, transparent)
    ),
    color-mix(in srgb, var(--sniptale-color-surface-canvas) 76%, var(--sniptale-color-surface-panel) 24%);
  box-shadow: inset 0 1px 2px color-mix(in srgb, var(--sniptale-color-overlay) 18%, transparent);
}

.sniptale-glass-range::-moz-range-track {
  height: var(--sniptale-range-track-height);
  border-radius: 9999px;
  border: 1px solid color-mix(in srgb, var(--sniptale-color-border-strong) 72%, transparent);
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, white 8%, transparent),
      color-mix(in srgb, var(--sniptale-color-surface-canvas) 10%, transparent)
    ),
    color-mix(in srgb, var(--sniptale-color-surface-canvas) 76%, var(--sniptale-color-surface-panel) 24%);
  box-shadow: inset 0 1px 2px color-mix(in srgb, var(--sniptale-color-overlay) 18%, transparent);
}

.sniptale-glass-range::-moz-range-progress {
  height: var(--sniptale-range-track-height);
  border-radius: 9999px;
  background: color-mix(in srgb, var(--sniptale-color-accent) 78%, white 22%);
}

.sniptale-glass-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  margin-top: calc((var(--sniptale-range-track-height) - var(--sniptale-range-thumb-size)) / 2);
  width: var(--sniptale-range-thumb-size);
  height: var(--sniptale-range-thumb-size);
  border-radius: 9999px;
  border: 1px solid color-mix(in srgb, var(--sniptale-color-accent) 32%, transparent);
  background: color-mix(in srgb, var(--sniptale-color-accent) 58%, var(--sniptale-color-surface-panel) 42%);
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--sniptale-color-accent) 8%, transparent),
    0 2px 6px color-mix(in srgb, var(--sniptale-color-overlay) 20%, transparent),
    inset 0 0 0 6px color-mix(in srgb, white 94%, var(--sniptale-color-surface-panel) 6%);
  transition: box-shadow 0.18s ease-out;
}

.sniptale-glass-range:hover::-webkit-slider-thumb {
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--sniptale-color-accent) 8%, transparent),
    0 2px 6px color-mix(in srgb, var(--sniptale-color-overlay) 20%, transparent),
    inset 0 0 0 5px color-mix(in srgb, white 94%, var(--sniptale-color-surface-panel) 6%);
}

.sniptale-glass-range::-moz-range-thumb {
  appearance: none;
  width: var(--sniptale-range-thumb-size);
  height: var(--sniptale-range-thumb-size);
  border-radius: 9999px;
  border: 1px solid color-mix(in srgb, var(--sniptale-color-accent) 32%, transparent);
  background: color-mix(in srgb, var(--sniptale-color-accent) 58%, var(--sniptale-color-surface-panel) 42%);
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--sniptale-color-accent) 8%, transparent),
    0 2px 6px color-mix(in srgb, var(--sniptale-color-overlay) 20%, transparent),
    inset 0 0 0 6px color-mix(in srgb, white 94%, var(--sniptale-color-surface-panel) 6%);
  transition: box-shadow 0.18s ease-out;
}

.sniptale-glass-range:hover::-moz-range-thumb {
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--sniptale-color-accent) 8%, transparent),
    0 2px 6px color-mix(in srgb, var(--sniptale-color-overlay) 20%, transparent),
    inset 0 0 0 5px color-mix(in srgb, white 94%, var(--sniptale-color-surface-panel) 6%);
}

.sniptale-glass-range-meta {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  font-size: 12px;
  color: var(--sniptale-color-text-dim);
}

.sniptale-glass-input {
  width: 100%;
  min-height: 34px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--sniptale-color-border-strong) 72%, transparent);
  background: color-mix(
    in srgb,
    var(--sniptale-color-surface-canvas) 12%,
    var(--sniptale-color-surface-panel) 88%
  );
  box-shadow: inset 0 1px 2px color-mix(in srgb, var(--sniptale-color-shadow-strong) 28%, transparent);
  color: var(--sniptale-color-text-primary);
  font-size: 12px;
  font-family: inherit;
}

.sniptale-glass-input:disabled {
  color: var(--sniptale-color-text-dim);
  background: color-mix(
    in srgb,
    var(--sniptale-color-surface-canvas) 16%,
    var(--sniptale-color-surface-panel) 84%
  );
  cursor: not-allowed;
}

.sniptale-glass-input:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--sniptale-color-accent) 45%, transparent);
  box-shadow:
    inset 0 1px 2px color-mix(in srgb, var(--sniptale-color-shadow-strong) 28%, transparent),
    0 0 0 1px color-mix(in srgb, var(--sniptale-color-accent) 12%, transparent);
}

.sniptale-glass-mini-button {
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 9999px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
}

.sniptale-glass-bold-button {
  width: 34px;
  height: 32px;
  padding: 0;
  border-radius: 8px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 6px;
}

.sniptale-glass-destructive {
  width: 100%;
  min-height: 34px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--sniptale-color-danger) 38%, transparent);
  background: color-mix(in srgb, var(--sniptale-color-danger) 12%, transparent);
  color: color-mix(in srgb, var(--sniptale-color-danger) 32%, white 68%);
  cursor: pointer;
  font-family: inherit;
}

.sniptale-glass-destructive:hover {
  background: color-mix(in srgb, var(--sniptale-color-danger) 18%, transparent);
  border-color: color-mix(in srgb, var(--sniptale-color-danger) 52%, transparent);
}

.sniptale-glass-muted { color: var(--sniptale-color-text-dim); }
.sniptale-glass-dim { color: var(--sniptale-color-text-dim); }
`;
