import { runChromeVoidCallback, subscribeToChromeEvent } from './callback';

type DebuggerEventListener = typeof chrome.debugger.onEvent.addListener extends (
  listener: infer T
) => void
  ? T
  : never;

type DebuggerDetachListener = typeof chrome.debugger.onDetach.addListener extends (
  listener: infer T
) => void
  ? T
  : never;

/**
 * Shared Chrome debugger seam for attach/detach, commands, and event wiring.
 */
interface BrowserDebuggerAdapter {
  attach(target: chrome.debugger.Debuggee, requiredVersion: string): Promise<void>;
  detach(target: chrome.debugger.Debuggee): Promise<void>;
  getTargets(): Promise<chrome.debugger.TargetInfo[]>;
  sendCommand<T>(
    target: chrome.debugger.Debuggee,
    method: string,
    commandParams?: Record<string, unknown>
  ): Promise<T>;
  subscribeToEvent(listener: DebuggerEventListener): () => void;
  subscribeToDetach(listener: DebuggerDetachListener): () => void;
}

export const browserDebugger: BrowserDebuggerAdapter = {
  attach(target, requiredVersion) {
    return runChromeVoidCallback(
      (callback) => chrome.debugger.attach(target, requiredVersion, callback),
      'chrome.debugger is unavailable'
    );
  },

  detach(target) {
    return runChromeVoidCallback(
      (callback) => chrome.debugger.detach(target, callback),
      'chrome.debugger is unavailable'
    );
  },

  getTargets() {
    return chrome.debugger.getTargets();
  },

  sendCommand<T>(
    target: chrome.debugger.Debuggee,
    method: string,
    commandParams?: Record<string, unknown>
  ) {
    return chrome.debugger.sendCommand(target, method, commandParams) as Promise<T>;
  },

  subscribeToEvent(listener) {
    return subscribeToChromeEvent(chrome.debugger.onEvent, listener);
  },

  subscribeToDetach(listener) {
    return subscribeToChromeEvent(chrome.debugger.onDetach, listener);
  },
};
