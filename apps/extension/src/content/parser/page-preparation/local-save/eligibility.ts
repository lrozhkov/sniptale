import { translate } from '../../../../platform/i18n';
import type {
  LocalHtmlFileSystemAccess,
  LocalHtmlSaveLocation,
  LocalHtmlSavePickerOptions,
} from './types';

const LOCAL_HTML_EXTENSION_PATTERN = /\.(?:html?|xhtml)$/i;

function getCurrentLocalHtmlLocation(): LocalHtmlSaveLocation {
  return window.location;
}

function getCurrentFileSystemAccess(): LocalHtmlFileSystemAccess {
  return window as LocalHtmlFileSystemAccess;
}

function getLocalHtmlPathname(location: LocalHtmlSaveLocation): string {
  try {
    return new URL(location.href).pathname;
  } catch {
    return location.pathname;
  }
}

function decodeSuggestedFileName(pathname: string): string {
  const fallbackName = 'prepared-page.html';
  const lastSegment = pathname.split('/').filter(Boolean).at(-1);
  if (!lastSegment) {
    return fallbackName;
  }

  try {
    return decodeURIComponent(lastSegment);
  } catch {
    return lastSegment;
  }
}

export function isWritableLocalHtmlPage(
  location: LocalHtmlSaveLocation = getCurrentLocalHtmlLocation(),
  access: LocalHtmlFileSystemAccess = getCurrentFileSystemAccess()
): boolean {
  if (location.protocol !== 'file:') {
    return false;
  }

  if (typeof access.showSaveFilePicker !== 'function') {
    return false;
  }

  return LOCAL_HTML_EXTENSION_PATTERN.test(getLocalHtmlPathname(location));
}

export function createLocalHtmlSavePickerOptions(
  location: LocalHtmlSaveLocation = getCurrentLocalHtmlLocation()
): LocalHtmlSavePickerOptions {
  return {
    excludeAcceptAllOption: false,
    suggestedName: decodeSuggestedFileName(getLocalHtmlPathname(location)),
    types: [
      {
        accept: { 'text/html': ['.html', '.htm'] },
        description: translate('content.toolbar.localHtmlSavePickerDescription'),
      },
    ],
  };
}
