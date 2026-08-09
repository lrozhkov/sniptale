import { describe, expect, it } from 'vitest';
import {
  buildSettingsRouteUrl,
  resolveSettingsRoute,
  SETTINGS_SECTION_IDS,
  SETTINGS_SECTION_VIEWS,
} from './codec';

const BASE = 'chrome-extension://test/apps/extension/src/settings/index.html';

describe('settings route codec', () => {
  it('exposes the canonical leaf and view inventory', () => {
    expect(SETTINGS_SECTION_IDS).toHaveLength(13);
    expect(SETTINGS_SECTION_VIEWS).toMatchObject({
      annotations: ['borders', 'callouts', 'numbering'],
      'storage-drafts': [],
      'media-quality': ['image', 'video'],
      'editor-resources': ['tools', 'palettes'],
      'native-app': ['connection', 'capture', 'commands', 'telemetry'],
      'access-data': ['permissions', 'privacy'],
    });
  });

  it.each([
    ['appearance', 'interface-browser', undefined],
    ['ai', 'ai-connections', undefined],
    ['presets', 'screen-sizes', undefined],
    ['saves', 'saving', undefined],
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
    ['templates', 'ai-prompts', undefined],
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
    expect(implicit.normalizedUrl.toString()).toBe(`${BASE}?keep=1#anchor`);
    expect(canonical.shouldReplace).toBe(false);
    expect(canonical.route).toEqual({ section: 'media-quality', view: 'video' });
  });

  it('replaces invalid sections and views with route defaults', () => {
    const unknownSection = resolveSettingsRoute(`${BASE}?section=missing&keep=1`);
    const unknownView = resolveSettingsRoute(`${BASE}?section=annotations&view=missing`);
    expect(unknownSection.route).toEqual({ section: 'interface-browser' });
    expect(unknownSection.normalizedUrl.searchParams.get('keep')).toBe('1');
    expect(unknownView.route).toEqual({ section: 'annotations', view: 'borders' });
    expect(unknownView.normalizedUrl.searchParams.get('view')).toBe('borders');
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
  });
});
