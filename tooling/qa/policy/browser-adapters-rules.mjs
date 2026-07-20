import {
  BROADCAST_CHANNEL_OWNER_FILES,
  HISTORY_OWNER_FILES,
  LOCAL_STORAGE_OWNER_FILES,
} from './browser-adapters-owners.mjs';
import { normalizeBrowserAdapterPath } from './browser-adapters-paths.mjs';

function createMethodRule({ rule, message, target, methods }) {
  return {
    rule,
    message,
    astGrepPattern: `${target}.$METHOD($$$ARGS)`,
    astGrepConstraints: {
      METHOD: { regex: `^(?:${methods.join('|')})$` },
    },
  };
}

function createNestedMethodRule({ rule, message, target, segments }) {
  const [scope, methods] = segments;
  return {
    rule,
    message,
    astGrepPattern: `${target}.$SCOPE.$METHOD($$$ARGS)`,
    astGrepConstraints: {
      SCOPE: { regex: `^(?:${scope.join('|')})$` },
      METHOD: { regex: `^(?:${methods.join('|')})$` },
    },
  };
}

function createGlobalMethodRule({ rule, message, targetRegex, methods, allow }) {
  return {
    rule,
    message,
    astGrepPattern: '$TARGET.$METHOD($$$ARGS)',
    astGrepConstraints: {
      TARGET: { regex: targetRegex },
      METHOD: { regex: `^(?:${methods.join('|')})$` },
    },
    allow,
  };
}

const BROWSER_RUNTIME_RULES = [
  createMethodRule({
    rule: 'browser-runtime-info',
    message:
      'Use @sniptale/platform/browser/runtime for chrome.runtime manifest/URL/context access.',
    target: 'chrome.runtime',
    methods: ['getManifest', 'getURL', 'getContexts', 'getPlatformInfo'],
  }),
  createMethodRule({
    rule: 'browser-runtime-connect-direct',
    message: 'Use @sniptale/platform/browser/runtime for chrome.runtime.connect access.',
    target: 'chrome.runtime',
    methods: ['connect'],
  }),
  createNestedMethodRule({
    rule: 'browser-runtime-installed-listener',
    message: 'Use @sniptale/platform/browser/runtime for chrome.runtime.onInstalled subscriptions.',
    target: 'chrome.runtime',
    segments: [['onInstalled'], ['addListener', 'removeListener']],
  }),
  {
    rule: 'browser-runtime-last-error',
    message: 'Use @sniptale/platform/browser/runtime for chrome.runtime.lastError access.',
    astGrepPattern: 'chrome.runtime.lastError',
  },
];

const BROWSER_EVENT_RULES = [
  createNestedMethodRule({
    rule: 'browser-tabs-listener',
    message: 'Use @sniptale/platform/browser/tabs for tab listener subscriptions.',
    target: 'chrome.tabs',
    segments: [
      ['onUpdated', 'onActivated', 'onRemoved'],
      ['addListener', 'removeListener'],
    ],
  }),
  createNestedMethodRule({
    rule: 'browser-web-navigation-listener',
    message: 'Use @sniptale/platform/browser/web-navigation for webNavigation subscriptions.',
    target: 'chrome.webNavigation',
    segments: [['onBeforeNavigate'], ['addListener', 'removeListener']],
  }),
  createNestedMethodRule({
    rule: 'browser-debugger-listener',
    message: 'Use @sniptale/platform/browser/debugger for debugger listener subscriptions.',
    target: 'chrome.debugger',
    segments: [
      ['onEvent', 'onDetach'],
      ['addListener', 'removeListener'],
    ],
  }),
];

const BROWSER_GLOBAL_RULES = [
  createGlobalMethodRule({
    rule: 'browser-local-storage-direct',
    message: [
      'Use a canonical owner seam for localStorage access;',
      'do not read or write localStorage directly from arbitrary production modules.',
    ].join(' '),
    targetRegex: '^(?:localStorage|window\\.localStorage)$',
    methods: ['getItem', 'setItem', 'removeItem', 'clear'],
    allow: (relativePath) =>
      LOCAL_STORAGE_OWNER_FILES.has(normalizeBrowserAdapterPath(relativePath)),
  }),
  createGlobalMethodRule({
    rule: 'browser-history-direct',
    message: [
      'Use a canonical owner seam for history mutations;',
      'avoid direct window.history navigation outside registered runtime owners.',
    ].join(' '),
    targetRegex: '^(?:history|window\\.history)$',
    methods: ['pushState', 'replaceState', 'back', 'forward'],
    allow: (relativePath) => HISTORY_OWNER_FILES.has(normalizeBrowserAdapterPath(relativePath)),
  }),
  {
    rule: 'browser-broadcast-channel-direct',
    message: [
      'Use a canonical owner seam for BroadcastChannel usage;',
      'avoid constructing channels from arbitrary production modules.',
    ].join(' '),
    astGrepPattern: 'new $TARGET($$$ARGS)',
    astGrepConstraints: {
      TARGET: { regex: '^(?:BroadcastChannel|window\\.BroadcastChannel)$' },
    },
    allow: (relativePath) =>
      BROADCAST_CHANNEL_OWNER_FILES.has(normalizeBrowserAdapterPath(relativePath)),
  },
];

export const BROWSER_ADAPTER_RULES = [
  createMethodRule({
    rule: 'browser-action-direct',
    message: 'Use @sniptale/platform/browser/action for chrome.action badge/title access.',
    target: 'chrome.action',
    methods: ['setTitle', 'setBadgeText', 'setBadgeBackgroundColor'],
  }),
  ...BROWSER_RUNTIME_RULES,
  {
    rule: 'browser-storage-direct',
    message:
      'Use the composition/persistence/infrastructure/browser-storage owner for chrome.storage access.',
    astGrepPattern: 'chrome.storage.$AREA.$METHOD($$$ARGS)',
    astGrepConstraints: {
      AREA: { regex: '^(?:local|sync|session)$' },
      METHOD: { regex: '^(?:get|set|remove)$' },
    },
  },
  createMethodRule({
    rule: 'browser-storage-listener',
    message: [
      'Use the composition/persistence/infrastructure/browser-storage owner',
      'for chrome.storage.onChanged subscriptions.',
    ].join(' '),
    target: 'chrome.storage.onChanged',
    methods: ['addListener', 'removeListener'],
  }),
  createMethodRule({
    rule: 'browser-tabs-direct',
    message: 'Use @sniptale/platform/browser/tabs for chrome.tabs access.',
    target: 'chrome.tabs',
    methods: [
      'get',
      'query',
      'create',
      'update',
      'remove',
      'captureVisibleTab',
      'reload',
      'setZoom',
    ],
  }),
  ...BROWSER_EVENT_RULES,
  createMethodRule({
    rule: 'browser-downloads-direct',
    message: 'Use @sniptale/platform/browser/downloads for chrome.downloads access.',
    target: 'chrome.downloads',
    methods: ['download', 'search'],
  }),
  createMethodRule({
    rule: 'browser-windows-direct',
    message: 'Use @sniptale/platform/browser/windows for chrome.windows access.',
    target: 'chrome.windows',
    methods: ['get'],
  }),
  createMethodRule({
    rule: 'browser-downloads-listener',
    message: 'Use @sniptale/platform/browser/downloads for download listener subscriptions.',
    target: 'chrome.downloads.onChanged',
    methods: ['addListener', 'removeListener'],
  }),
  createMethodRule({
    rule: 'browser-debugger-direct',
    message: 'Use @sniptale/platform/browser/debugger for chrome.debugger access.',
    target: 'chrome.debugger',
    methods: ['attach', 'detach', 'getTargets', 'sendCommand'],
  }),
  {
    rule: 'browser-offscreen-direct',
    message: 'Use @sniptale/platform/browser/offscreen for chrome.offscreen access.',
    astGrepPattern: 'chrome.offscreen.createDocument($$$ARGS)',
  },
  {
    rule: 'browser-tab-capture-direct',
    message: 'Use @sniptale/platform/browser/tab-capture for chrome.tabCapture access.',
    astGrepPattern: 'chrome.tabCapture.getMediaStreamId($$$ARGS)',
  },
  {
    rule: 'browser-scripting-direct',
    message: 'Use @sniptale/platform/browser/scripting for chrome.scripting.executeScript.',
    astGrepPattern: 'chrome.scripting.executeScript($$$ARGS)',
  },
  ...BROWSER_GLOBAL_RULES,
];
