import baseStyles from '@sniptale/ui/styles?inline';
import aiModalStyles from '@sniptale/ui/styles/ai-modal?inline';
import glassStyles from '@sniptale/ui/styles/glass?inline';
import toolbarStyles from '@sniptale/ui/styles/toolbar?inline';
import overlayStyles from '@sniptale/ui/styles/overlays?inline';
import { runtimeInfo } from '@sniptale/platform/browser/runtime';
import contentRuntimeEffectsStyles from './effects.css?inline';
import contentAiPickerStyles from '../../overlay/ai/pick/runtime/styles.css?inline';

const CONTENT_ENTRYPOINT_FONT_URL_PATTERNS = [
  /url\((['"]?)\/node_modules\/@fontsource-variable\/manrope\/files\/(manrope-[\w-]+\.woff2)\1\)/g,
  /url\((['"]?)@fontsource-variable\/manrope\/files\/(manrope-[\w-]+\.woff2)\1\)/g,
  /url\((['"]?)\.\/(manrope-[\w-]+\.woff2)\1\)/g,
] as const;

/**
 * Content runtime styles injected into the owned shadow tree.
 */
const CONTENT_ENTRYPOINT_GLOBAL_STYLES = `
:host {
  all: initial;
  display: block;
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  opacity: 1;
  visibility: visible;
  pointer-events: none;
  width: 0;
  height: 0;
  overflow: visible;
  max-width: none;
  max-height: none;
  min-width: 0;
  min-height: 0;
  box-shadow: none;
  filter: none;
  backdrop-filter: none;
  transform: none;
  clip-path: none;
  isolation: isolate;
  position: fixed;
  top: 0;
  left: 0;
  z-index: 2147483647;
}

.sniptale-show-toolbar-button {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 44px;
  height: 44px;
  background: var(--sniptale-color-surface-panel);
  border: 1px solid var(--sniptale-color-border-soft);
  border-radius: 10px;
  color: var(--sniptale-color-accent);
  box-shadow:
    0 8px 18px color-mix(in srgb, var(--sniptale-color-shadow-strong) 18%, transparent),
    0 0 0 1px color-mix(in srgb, var(--sniptale-color-accent) 12%, transparent);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
  z-index: 2147483646;
  animation: sniptale-bounceIn 0.3s ease-out;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.sniptale-show-toolbar-button:hover {
  background: color-mix(
    in srgb,
    var(--sniptale-color-surface-canvas) 8%,
    var(--sniptale-color-surface-panel) 92%
  );
  border-color: var(--sniptale-color-border-accent-strong);
  color: var(--sniptale-color-accent-emphasis);
  transform: translateY(-1px);
  box-shadow:
    0 10px 20px color-mix(in srgb, var(--sniptale-color-shadow-strong) 20%, transparent),
    0 0 0 1px color-mix(in srgb, var(--sniptale-color-accent) 14%, transparent);
}
.sniptale-show-toolbar-button:active {
  transform: translateY(0);
}
.sniptale-show-toolbar-button svg {
  width: 20px;
  height: 20px;
  stroke-width: 2;
}
@keyframes sniptale-bounceIn {
  0% { transform: translateY(8px) scale(0.94); opacity: 0; }
  100% { transform: translateY(0) scale(1); opacity: 1; }
}
`;

function resolveRuntimeAssetUrl(resourcePath: string): string | null {
  try {
    return runtimeInfo.getURL(resourcePath);
  } catch {
    return null;
  }
}

export function resolveContentEntrypointStyleUrls(styles: string): string {
  return CONTENT_ENTRYPOINT_FONT_URL_PATTERNS.reduce((resolvedStyles, pattern, index) => {
    return resolvedStyles.replace(pattern, (_match, _quote: string, fileName: string) => {
      const resourcePath =
        index === 0
          ? `node_modules/@fontsource-variable/manrope/files/${fileName}`
          : `fonts/${fileName}`;
      const runtimeUrl = resolveRuntimeAssetUrl(resourcePath);

      return runtimeUrl ? `url("${runtimeUrl}")` : _match;
    });
  }, styles);
}

export function createContentEntrypointStyles(): string {
  return resolveContentEntrypointStyleUrls(
    [
      CONTENT_ENTRYPOINT_GLOBAL_STYLES,
      baseStyles,
      aiModalStyles,
      glassStyles,
      toolbarStyles,
      overlayStyles,
      contentRuntimeEffectsStyles,
      contentAiPickerStyles,
    ].join('\n')
  );
}

export { createContentEntrypointStyles as createPreparationSurfaceStyles };
