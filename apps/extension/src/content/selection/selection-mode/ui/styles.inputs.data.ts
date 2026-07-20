export const SELECTION_MODE_OVERLAY_INPUT_STYLE = `
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
