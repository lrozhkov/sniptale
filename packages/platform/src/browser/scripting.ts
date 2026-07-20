/**
 * Shared Chrome scripting seam for tab script execution helpers.
 */
interface BrowserScriptingAdapter {
  executeScript<Args extends unknown[], Result>(
    injection: chrome.scripting.ScriptInjection<Args, Result>
  ): Promise<Array<chrome.scripting.InjectionResult<chrome.scripting.Awaited<Result>>>>;
  getRegisteredContentScripts(
    filter?: chrome.scripting.ContentScriptFilter
  ): Promise<chrome.scripting.RegisteredContentScript[]>;
  registerContentScripts(scripts: chrome.scripting.RegisteredContentScript[]): Promise<void>;
  unregisterContentScripts(filter?: chrome.scripting.ContentScriptFilter): Promise<void>;
}

export const browserScripting: BrowserScriptingAdapter = {
  executeScript(injection) {
    return chrome.scripting.executeScript(injection);
  },
  getRegisteredContentScripts(filter) {
    return filter
      ? chrome.scripting.getRegisteredContentScripts(filter)
      : chrome.scripting.getRegisteredContentScripts();
  },
  registerContentScripts(scripts) {
    return chrome.scripting.registerContentScripts(scripts);
  },
  unregisterContentScripts(filter) {
    return filter
      ? chrome.scripting.unregisterContentScripts(filter)
      : chrome.scripting.unregisterContentScripts();
  },
};
