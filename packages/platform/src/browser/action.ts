/**
 * Shared browser action seam for popup opening, badge, and title updates.
 */
interface BrowserActionAdapter {
  openPopup(options?: chrome.action.OpenPopupOptions): Promise<void>;
  setTitle(details: chrome.action.TitleDetails): Promise<void>;
  setBadgeText(details: chrome.action.BadgeTextDetails): Promise<void>;
  setBadgeBackgroundColor(details: chrome.action.BadgeColorDetails): Promise<void>;
}

export const browserAction: BrowserActionAdapter = {
  openPopup(options) {
    return options ? chrome.action.openPopup(options) : chrome.action.openPopup();
  },

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
