import baseStyles from '@sniptale/ui/styles?inline';
import aiModalStyles from '@sniptale/ui/styles/ai-modal?inline';
import glassStyles from '@sniptale/ui/styles/glass?inline';
import toolbarStyles from '@sniptale/ui/styles/toolbar?inline';
import overlayStyles from '@sniptale/ui/styles/overlays?inline';
import { runtimeInfo } from '@sniptale/platform/browser/runtime';
import contentRuntimeEffectsStyles from './effects.css?inline';
import contentAiPickerStyles from '../../overlay/ai/pick/runtime/styles.css?inline';
import frameSettingsPopoverStyles from '../../selection/frame-settings-popover/styles.css?inline';
import contentHostStyles from './host.css?inline';

const CONTENT_ENTRYPOINT_FONT_URL_PATTERNS = [
  /url\((['"]?)\/node_modules\/@fontsource-variable\/manrope\/files\/(manrope-[\w-]+\.woff2)\1\)/g,
  /url\((['"]?)@fontsource-variable\/manrope\/files\/(manrope-[\w-]+\.woff2)\1\)/g,
  /url\((['"]?)\.\/(manrope-[\w-]+\.woff2)\1\)/g,
] as const;

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
      contentHostStyles,
      baseStyles,
      aiModalStyles,
      glassStyles,
      toolbarStyles,
      overlayStyles,
      contentRuntimeEffectsStyles,
      contentAiPickerStyles,
      frameSettingsPopoverStyles,
    ].join('\n')
  );
}

export { createContentEntrypointStyles as createPreparationSurfaceStyles };
