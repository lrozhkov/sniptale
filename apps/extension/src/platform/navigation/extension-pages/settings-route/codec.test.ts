import { describe, expect, it } from 'vitest';
import {
  buildSettingsRouteUrl,
  resolveSettingsRoute,
  SETTINGS_SECTION_IDS,
  SETTINGS_SECTION_VIEWS,
  updateSettingsRouteView,
} from './codec';

const BASE = 'chrome-extension://test/apps/extension/src/settings/index.html';

describe('settings route codec', () => {
  it('exposes the canonical leaf and view inventory', () => {
    expect(SETTINGS_SECTION_IDS).toHaveLength(16);
    expect(SETTINGS_SECTION_VIEWS).toMatchObject({
      'interface-browser': ['interface', 'context-menu'],
      annotations: ['borders', 'callouts', 'numbering', 'tags'],
      'media-quality': ['image', 'video'],
      saving: ['settings', 'storage', 'templates', 'files'],
      drafts: [],
      'editor-resources': ['tools', 'palettes', 'surfaces', 'gradients'],
      'ai-connections': ['integrations', 'chrome-ai', 'security'],
      'ai-prompts': ['templates', 'scenario-templates', 'prompts'],
      'native-app': ['connection', 'capture', 'commands', 'telemetry'],
      'access-data': ['permissions', 'privacy'],
      'settings-transfer': [],
    });
  });

  it.each([
    ['appearance', 'interface-browser', 'interface'],
    ['ai', 'ai-connections', 'integrations'],
    ['presets', 'screen-sizes', undefined],
    ['saves', 'saving', 'settings'],
    ['storage-drafts', 'drafts', undefined],
    ['highlighter', 'annotations', 'borders'],
    ['editor', 'editor-resources', 'tools'],
    ['image', 'media-quality', 'image'],
    ['video', 'media-quality', 'video'],
    ['quickactions', 'quick-actions', undefined],
    ['voice-input', 'voice-input', undefined],
    ['native-app', 'native-app', 'connection'],
    ['native-hotkeys', 'native-app', 'commands'],
    ['native-screenshots', 'native-app', 'capture'],
    ['native-video', 'native-app', 'capture'],
    ['native-telemetry', 'native-app', 'telemetry'],
    ['templates', 'ai-prompts', 'templates'],
    ['permissions', 'access-data', 'permissions'],
    ['privacy', 'access-data', 'privacy'],
  ])('normalizes legacy section %s', (legacy, section, view) => {
    const result = resolveSettingsRoute(`${BASE}?keep=1&section=${legacy}#anchor`);
    expect(result.route).toEqual(view ? { section, view } : { section });
    expect(result.shouldReplace).toBe(true);
    expect(result.normalizedUrl.searchParams.get('keep')).toBe('1');
    expect(result.normalizedUrl.hash).toBe('#anchor');
  });

  it('keeps canonical and implicit-default URLs unchanged', () => {
    const implicit = resolveSettingsRoute(`${BASE}?keep=1#anchor`);
    const canonical = resolveSettingsRoute(
      `${BASE}?section=media-quality&view=video&keep=1#anchor`
    );
    expect(implicit.shouldReplace).toBe(false);
    expect(implicit.route).toEqual({ section: 'interface-browser', view: 'interface' });
    expect(implicit.normalizedUrl.toString()).toBe(`${BASE}?keep=1#anchor`);
    expect(canonical.shouldReplace).toBe(false);
    expect(canonical.route).toEqual({ section: 'media-quality', view: 'video' });
  });

  it('replaces invalid sections and views with route defaults', () => {
    const unknownSection = resolveSettingsRoute(`${BASE}?section=missing&keep=1`);
    const unknownView = resolveSettingsRoute(`${BASE}?section=annotations&view=missing`);
    expect(unknownSection.route).toEqual({ section: 'interface-browser', view: 'interface' });
    expect(unknownSection.normalizedUrl.searchParams.get('keep')).toBe('1');
    expect(unknownView.route).toEqual({ section: 'annotations', view: 'borders' });
    expect(unknownView.normalizedUrl.searchParams.get('view')).toBe('borders');
  });

  it('resolves Interface views and preserves unrelated URL state', () => {
    const implicitInterface = resolveSettingsRoute(
      `${BASE}?section=interface-browser&keep=1#anchor`
    );
    expect(implicitInterface.route).toEqual({ section: 'interface-browser', view: 'interface' });
    expect(implicitInterface.shouldReplace).toBe(false);
    expect(implicitInterface.normalizedUrl.toString()).toBe(
      `${BASE}?section=interface-browser&keep=1#anchor`
    );

    const contextMenu = resolveSettingsRoute(
      `${BASE}?keep=1&section=interface-browser&view=context-menu#anchor`
    );
    expect(contextMenu.route).toEqual({ section: 'interface-browser', view: 'context-menu' });
    expect(contextMenu.shouldReplace).toBe(false);
    expect(
      buildSettingsRouteUrl(contextMenu.normalizedUrl, { section: 'interface-browser' }).toString()
    ).toBe(`${BASE}?keep=1&section=interface-browser&view=interface#anchor`);
    expect(updateSettingsRouteView(contextMenu.route, 'interface')).toEqual({
      section: 'interface-browser',
      view: 'interface',
    });
    expect(() => updateSettingsRouteView(contextMenu.route, 'missing')).toThrow();

    const invalid = resolveSettingsRoute(
      `${BASE}?keep=1&section=interface-browser&view=missing#anchor`
    );
    expect(invalid.route).toEqual({ section: 'interface-browser', view: 'interface' });
    expect(invalid.shouldReplace).toBe(true);
    expect(invalid.normalizedUrl.toString()).toBe(
      `${BASE}?keep=1&section=interface-browser&view=interface#anchor`
    );
  });

  it('builds canonical URLs while preserving unrelated query and hash values', () => {
    const result = buildSettingsRouteUrl(`${BASE}?keep=1&section=old&view=old#anchor`, {
      section: 'access-data',
      view: 'privacy',
    });
    expect(result.toString()).toBe(`${BASE}?keep=1&section=access-data&view=privacy#anchor`);
    expect(buildSettingsRouteUrl(BASE, { section: 'annotations' }).searchParams.get('view')).toBe(
      'borders'
    );
    expect(
      buildSettingsRouteUrl(BASE, { section: 'annotations', view: 'tags' }).searchParams.get('view')
    ).toBe('tags');
    expect(buildSettingsRouteUrl(BASE, { section: 'ai-prompts' }).searchParams.get('view')).toBe(
      'templates'
    );
    expect(buildSettingsRouteUrl(BASE, { section: 'saving' }).searchParams.get('view')).toBe(
      'settings'
    );
    expect(
      buildSettingsRouteUrl(BASE, { section: 'ai-connections' }).searchParams.get('view')
    ).toBe('integrations');
  });

  it('round-trips the Files subpage while old Saving URLs retain their default', () => {
    const files = buildSettingsRouteUrl(`${BASE}?keep=1#anchor`, {
      section: 'saving',
      view: 'files',
    });
    expect(files.toString()).toBe(`${BASE}?keep=1&section=saving&view=files#anchor`);
    expect(resolveSettingsRoute(files)).toMatchObject({
      route: { section: 'saving', view: 'files' },
      shouldReplace: false,
    });
    expect(resolveSettingsRoute(`${BASE}?section=saving`)).toMatchObject({
      route: { section: 'saving', view: 'settings' },
      shouldReplace: false,
    });
  });

  it('opens Drafts as a leaf without changing existing Saving subpage URLs', () => {
    const drafts = buildSettingsRouteUrl(`${BASE}?keep=1#anchor`, {
      section: 'drafts',
    });
    expect(resolveSettingsRoute(drafts)).toMatchObject({
      route: { section: 'drafts' },
      shouldReplace: false,
    });
    for (const view of ['settings', 'storage', 'templates', 'files'] as const) {
      expect(resolveSettingsRoute(`${BASE}?section=saving&view=${view}`)).toMatchObject({
        route: { section: 'saving', view },
        shouldReplace: false,
      });
    }
  });
});

it('opens scenario layouts as a canonical settings leaf', () => {
  const url = buildSettingsRouteUrl(BASE, { section: 'scenario-layouts' });
  expect(resolveSettingsRoute(url)).toMatchObject({
    route: { section: 'scenario-layouts' },
    shouldReplace: false,
    source: 'canonical',
  });
});
