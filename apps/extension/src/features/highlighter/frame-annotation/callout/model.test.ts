import { describe, expect, it } from 'vitest';
import type { LegacyCalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import { getCanonicalSystemCalloutPreset } from '../../callout-presets/catalog';
import { applyCalloutSettingsPatch, cloneCalloutSettings, normalizeCalloutSettings } from './model';

const legacy: LegacyCalloutSettings = {
  anchor: 'top-center',
  bgColor: '#222222',
  enabled: true,
  fontFamily: 'sans',
  fontSize: 14,
  fontWeight: 'normal',
  htmlContent: '<p>Body</p>',
  maxWidth: 200,
  side: 'top',
  tailSize: 8,
  textColor: '#ffffff',
  variant: 'bubble',
};

describe('callout model', () => {
  it('normalizes legacy bubbles into the nested wedge model', () => {
    const normalized = normalizeCalloutSettings(legacy);
    expect(normalized.content).toEqual({ bodyHtml: '<p>Body</p>', titleText: '' });
    expect(normalized.placement).toMatchObject({ anchor: 'top-center', side: 'top' });
    expect(normalized.style.connector).toMatchObject({ kind: 'wedge', wedgeSize: 8 });
  });

  it('keeps the canonical Bubble visually equivalent to the legacy default', () => {
    const normalized = normalizeCalloutSettings({
      ...legacy,
      bgColor: '#2b3038',
      htmlContent: '',
      side: 'auto',
      textColor: '#f8fafc',
    });
    expect(getCanonicalSystemCalloutPreset('system-callout-bubble').style).toEqual(
      normalized.style
    );
  });

  it('applies nested patches without erasing style siblings and clears preset identity', () => {
    const normalized = { ...normalizeCalloutSettings(legacy), sourcePresetId: 'preset-1' };
    const patched = applyCalloutSettingsPatch(normalized, {
      sourcePresetId: undefined,
      style: { surface: { radius: 24 } },
    });
    expect(patched.sourcePresetId).toBeUndefined();
    expect(patched.style.surface.radius).toBe(24);
    expect(patched.style.surface.backgroundColor).toBe('#222222');
    expect(patched.style.connector.kind).toBe('wedge');
  });

  it('deep-clones content, placement, and visual style', () => {
    const normalized = normalizeCalloutSettings({
      ...legacy,
      manualPlacement: { centerOffsetX: 10, centerOffsetY: 20 },
    });
    normalized.placement.connectorWaypoint = { centerOffsetX: -30, centerOffsetY: 40 };
    const cloned = cloneCalloutSettings(normalized);
    expect(cloned.content).not.toBe(normalized.content);
    expect(cloned.placement).not.toBe(normalized.placement);
    expect(cloned.placement.manualPlacement).not.toBe(normalized.placement.manualPlacement);
    expect(cloned.placement.connectorWaypoint).not.toBe(normalized.placement.connectorWaypoint);
    expect(cloned.style.surface).not.toBe(normalized.style.surface);
  });

  it('migrates legacy perimeter positions to free attachments without mutating input', () => {
    const current = normalizeCalloutSettings(legacy);
    const oldCurrent = cloneCalloutSettings(current);
    delete oldCurrent.placement.connectorAttachments;
    oldCurrent.placement.connectorBasePosition = 0.25;
    oldCurrent.placement.connectorFramePosition = 0.75;

    const normalized = normalizeCalloutSettings(oldCurrent);

    expect(normalized.placement.connectorAttachments).toEqual({
      block: { mode: 'free', perimeterPosition: 0.25 },
      frame: { mode: 'free', perimeterPosition: 0.75 },
    });
    expect(oldCurrent.placement.connectorAttachments).toBeUndefined();
  });

  it('defaults absent attachment and visual parameters without changing the waypoint model', () => {
    const current = normalizeCalloutSettings(legacy);
    const oldCurrent = cloneCalloutSettings(current);
    delete oldCurrent.placement.connectorAttachments;
    oldCurrent.placement.connectorWaypoint = { centerOffsetX: 8, centerOffsetY: -12 };
    Reflect.deleteProperty(oldCurrent.style, 'badge');
    Reflect.deleteProperty(oldCurrent.style.connector, 'cornerStyle');
    Reflect.deleteProperty(oldCurrent.style.connector, 'curve');
    Reflect.deleteProperty(oldCurrent.style.connector, 'spacing');

    const normalized = normalizeCalloutSettings(oldCurrent);

    expect(normalized.placement.connectorAttachments).toEqual({
      block: { mode: 'auto' },
      frame: { mode: 'auto' },
    });
    expect(normalized.placement.connectorWaypoint).toEqual({
      centerOffsetX: 8,
      centerOffsetY: -12,
    });
    expect(normalized.style.connector).toMatchObject({
      cornerStyle: { kind: 'sharp', radius: 8 },
      curve: { curvature: 0.35, mode: 'auto' },
      spacing: { blockGap: 0, frameGap: 0, minimumEndSegment: 16, obstacleMargin: 0 },
    });
    expect(normalized.style.badge.enabled).toBe(false);
  });
});
