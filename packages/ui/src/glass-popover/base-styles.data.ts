export const glassPopoverBaseStyles = `
.sniptale-glass-popover {
  width: 280px;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--sniptale-color-text-inverse) 8%, transparent),
      transparent 18%
    ),
    color-mix(in srgb, var(--sniptale-color-surface-panel) 96%, var(--sniptale-color-surface-canvas));
  border: 1px solid color-mix(in srgb, var(--sniptale-color-border-soft) 92%, transparent);
  border-top-color: color-mix(in srgb, var(--sniptale-color-text-inverse) 22%, transparent);
  border-radius: 14px;
  box-shadow:
    0 8px 20px color-mix(in srgb, var(--sniptale-color-shadow-strong) 18%, transparent),
    inset 0 1px 0 color-mix(in srgb, var(--sniptale-color-text-inverse) 6%, transparent);
  padding: 12px;
  color: var(--sniptale-color-text-primary);
  animation: popoverFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  box-sizing: border-box;
  user-select: none;
  -webkit-user-select: none;
}
.sniptale-glass-popover *,
.sniptale-glass-popover *::before,
.sniptale-glass-popover *::after {
  box-sizing: border-box;
  font-family: inherit;
}
.sniptale-glass-popover--wide {
  width: 320px;
}
.sniptale-glass-popover-scroll {
  max-height: 80vh;
  overflow-y: auto;
}
.sniptale-glass-popover-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sniptale-glass-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  background: color-mix(
    in srgb,
    var(--sniptale-color-surface-canvas) 18%,
    var(--sniptale-color-surface-panel) 82%
  );
  border: 1px solid color-mix(in srgb, var(--sniptale-color-border-soft) 84%, transparent);
  border-top-color: color-mix(in srgb, var(--sniptale-color-text-inverse) 14%, transparent);
  border-radius: 10px;
}
.sniptale-glass-section-label {
  display: block;
  margin: 0;
  margin-bottom: 8px;
  font-size: 12px;
  line-height: 1.35;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--sniptale-color-text-dim);
}
.sniptale-glass-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sniptale-glass-row--spread {
  justify-content: space-between;
}
.sniptale-glass-grid-3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}
.sniptale-glass-arrow-grid {
  display: grid;
  grid-template-columns: repeat(3, 30px);
  grid-template-rows: repeat(3, 30px);
  gap: 6px;
  align-items: center;
  justify-items: center;
}
`;
