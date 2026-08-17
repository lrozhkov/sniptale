import { subscribeToChromeEvent } from './callback';

export type BrowserCommandListener = (command: string, tab?: chrome.tabs.Tab) => void;

interface CommandsCompatEvent {
  addListener(listener: BrowserCommandListener): void;
  removeListener(listener: BrowserCommandListener): void;
}

interface CommandsCompatApi {
  onCommand: CommandsCompatEvent;
}

function getCommandsApi(): CommandsCompatApi | null {
  if (typeof chrome === 'undefined') return null;
  return (chrome as typeof chrome & { commands?: CommandsCompatApi }).commands ?? null;
}

interface BrowserCommandsAdapter {
  isAvailable(): boolean;
  subscribeToCommand(listener: BrowserCommandListener): () => void;
}

export const browserCommands: BrowserCommandsAdapter = {
  isAvailable() {
    return getCommandsApi() !== null;
  },

  subscribeToCommand(listener) {
    return subscribeToChromeEvent(getCommandsApi()?.onCommand, listener);
  },
};
