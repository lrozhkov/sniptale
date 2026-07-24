const SELECTION_MODE_CANCEL_BUTTON_STYLE = `
  .sniptale-selection-cancel-button {
    transition:
      background 120ms ease,
      border-color 120ms ease,
      color 120ms ease,
      transform 120ms ease,
      box-shadow 120ms ease;
  }

  .sniptale-selection-cancel-button:hover {
    background: color-mix(in srgb, var(--sniptale-color-surface-hover) 86%, transparent);
    border-color: color-mix(in srgb, var(--sniptale-color-accent) 26%, transparent);
    color: var(--sniptale-color-text-primary-strong);
  }

  .sniptale-selection-cancel-button:active {
    transform: translateY(1px);
    background: color-mix(in srgb, var(--sniptale-color-accent) 8%, var(--sniptale-color-surface-hover) 92%);
  }

  .sniptale-selection-cancel-button:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--sniptale-color-accent) 72%, transparent);
    outline-offset: 2px;
  }
`;

const SELECTION_MODE_OVERLAY_INPUT_STYLE = `
  .sniptale-size-input::-webkit-outer-spin-button,
  .sniptale-size-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .sniptale-size-input {
    -moz-appearance: textfield;
    cursor: text;
    width: 68px;
    min-height: 32px;
    padding: 6px 8px;
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--sniptale-color-border-soft) 84%, transparent);
    background: color-mix(in srgb, var(--sniptale-color-surface-input) 92%, transparent);
    color: var(--sniptale-color-text-primary);
    font-size: 12px;
    font-weight: 500;
    text-align: center;
  }
  .sniptale-size-input:focus {
    outline: none;
    border-color: color-mix(in srgb, var(--sniptale-color-accent) 22%, var(--sniptale-color-border-soft) 78%) !important;
    box-shadow:
      0 0 0 3px color-mix(in srgb, var(--sniptale-color-accent) 7%, transparent) !important;
  }
  .sniptale-selection-size-panel {
    position: absolute;
    min-width: 232px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    pointer-events: auto;
    z-index: 20;
    background: color-mix(in srgb, var(--sniptale-color-surface-panel) 98%, transparent);
    border: 1px solid color-mix(in srgb, var(--sniptale-color-border-soft) 86%, transparent);
    border-radius: 18px;
    box-shadow: 0 16px 30px color-mix(in srgb, var(--sniptale-color-overlay) 14%, transparent);
    font-family: var(--sniptale-font-sans);
    box-sizing: border-box;
  }
  .sniptale-selection-size-title {
    font-size: 12px;
    line-height: 1.35;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--sniptale-color-text-muted-strong);
  }
  .sniptale-selection-size-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .sniptale-selection-size-label {
    width: 20px;
    font-size: 12px;
    font-weight: 600;
    color: var(--sniptale-color-text-primary);
  }
  .sniptale-size-btn {
    width: 32px;
    height: 32px;
    border: 1px solid color-mix(
      in srgb,
      var(--sniptale-color-border-soft) 74%,
      transparent
    );
    border-radius: 12px;
    background: color-mix(in srgb, var(--sniptale-color-surface-hover) 60%, transparent);
    color: var(--sniptale-color-text-secondary);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    transition:
      background-color 0.15s ease,
      border-color 0.15s ease,
      color 0.15s ease,
      box-shadow 0.15s ease;
  }
  .sniptale-size-btn:hover {
    background: color-mix(in srgb, var(--sniptale-color-surface-hover) 84%, transparent);
    border-color: color-mix(in srgb, var(--sniptale-color-border-strong) 72%, transparent);
    color: var(--sniptale-color-text-primary-strong);
  }
  .sniptale-selection-size-unit {
    margin-left: 2px;
    font-size: 12px;
    color: var(--sniptale-color-text-muted);
  }
`;

const SELECTION_MODE_OVERLAY_TOGGLE_STYLE = `
  .sniptale-selection-size-toggle {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 2px;
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--sniptale-color-border-soft) 82%, transparent);
    background: color-mix(in srgb, var(--sniptale-color-surface-hover) 44%, transparent);
    cursor: pointer;
  }
  .sniptale-selection-size-checkbox {
    appearance: none;
    -webkit-appearance: none;
    width: 18px;
    height: 18px;
    flex: 0 0 auto;
    border-radius: 6px;
    border: 1px solid color-mix(in srgb, var(--sniptale-color-border-strong) 82%, transparent);
    background: color-mix(in srgb, var(--sniptale-color-surface-input) 92%, transparent);
    position: relative;
    transition: background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .sniptale-selection-size-checkbox:hover {
    border-color: color-mix(in srgb, var(--sniptale-color-border-strong) 76%, transparent);
    background: color-mix(in srgb, var(--sniptale-color-surface-hover) 82%, transparent);
  }
  .sniptale-selection-size-checkbox:checked {
    border-color: color-mix(in srgb, var(--sniptale-color-accent) 24%, transparent);
    background: color-mix(in srgb, var(--sniptale-color-accent) 8%, transparent);
  }
  .sniptale-selection-size-checkbox:checked::after {
    content: '';
    position: absolute;
    left: 6px;
    top: 2px;
    width: 4px;
    height: 8px;
    border: solid var(--sniptale-color-accent);
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
  }
  .sniptale-selection-size-toggle-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .sniptale-selection-size-toggle-title {
    font-size: 12px;
    color: var(--sniptale-color-text-primary);
  }
  .sniptale-selection-size-toggle-hint {
    font-size: 12px;
    color: var(--sniptale-color-text-muted);
  }
`;

export const SELECTION_MODE_OVERLAY_STYLE = [
  SELECTION_MODE_CANCEL_BUTTON_STYLE,
  SELECTION_MODE_OVERLAY_INPUT_STYLE,
  SELECTION_MODE_OVERLAY_TOGGLE_STYLE,
].join('\n');
