/**
 * Shared browser action seam for badge and title updates.
 */
interface BrowserActionAdapter {
  setTitle(details: chrome.action.TitleDetails): Promise<void>;
  setBadgeText(details: chrome.action.BadgeTextDetails): Promise<void>;
  setBadgeBackgroundColor(details: chrome.action.BadgeColorDetails): Promise<void>;
}

export const browserAction: BrowserActionAdapter = {
  setTitle(details) {
    return chrome.action.setTitle(details);
  },

  setBadgeText(details) {
    return chrome.action.setBadgeText(details);
  },

  setBadgeBackgroundColor(details) {
    return chrome.action.setBadgeBackgroundColor(details);
  },
};
