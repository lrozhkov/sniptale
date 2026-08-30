import { describe, expect, it } from 'vitest';

import { analyzeStructuralSource } from './report.mjs';

const analyzeSelectionState = (source: string) =>
  analyzeStructuralSource('apps/extension/src/content/selection/state.ts', source);

describe('same-file composite session authority aliases', () => {
  it('collapses mutable members of a strongly named persistence-session dependency bag', () => {
    const metric = analyzeSelectionState(
      `function createSync(args) {
        return () => {
          args.latestRequestRef.current += 1;
          args.setLoading(false);
          args.setSettings({ ready: true });
        };
      }
      export function useSettings() {
        const settingsPersistenceSessionRef = useRef({});
        const latestRequestRef = useRef(0);
        const [loading, setLoading] = useState(true);
        const [settings, setSettings] = useState(null);
        return createSync({
          latestRequestRef,
          settingsPersistenceSession: settingsPersistenceSessionRef.current,
          setLoading,
          setSettings,
        });
      }`
    );

    expect(metric.stateAuthorities).toBe(1);
    expect(metric.stateAuthorityNames).toEqual(['settingsPersistenceSessionRef']);
  });

  it('keeps mutable members distinct without one strong session anchor', () => {
    const metric = analyzeSelectionState(
      `function createSync(args) {
        args.latestRequestRef.current += 1;
        args.setLoading(false);
      }
      export function useSettings() {
        const browserSession = {};
        const latestRequestRef = useRef(0);
        const [loading, setLoading] = useState(true);
        createSync({ browserSession, latestRequestRef, setLoading });
        return loading;
      }`
    );

    expect(metric.stateAuthorities).toBe(2);
    expect(metric.stateAuthorityNames).toEqual(['latestRequestRef', 'setLoading']);
  });

  it('keeps one mutable member distinct when it is passed to different session anchors', () => {
    const metric = analyzeSelectionState(
      `function sync(args) { args.setLoading(false); }
      export function useSettings() {
        const [loading, setLoading] = useState(true);
        const firstPersistenceSession = {};
        const secondPersistenceSession = {};
        sync({ settingsPersistenceSession: firstPersistenceSession, setLoading });
        sync({ settingsPersistenceSession: secondPersistenceSession, setLoading });
        return loading;
      }`
    );

    expect(metric.stateAuthorityNames).toEqual(['setLoading']);
  });

  it('collapses repeated calls only when they retain the same proven session anchor', () => {
    const metric = analyzeSelectionState(
      `function sync(args) { args.setLoading(false); }
      export function useSettings() {
        const [loading, setLoading] = useState(true);
        const settingsPersistenceSession = {};
        sync({ settingsPersistenceSession, setLoading });
        sync({ settingsPersistenceSession, setLoading });
        return loading;
      }`
    );

    expect(metric.stateAuthorityNames).toEqual(['settingsPersistenceSession']);
  });

  it('keeps known members distinct when a spread can conceal another session anchor', () => {
    const metric = analyzeSelectionState(
      `function sync(args) { args.setLoading(false); }
      export function useSettings(extra) {
        const [loading, setLoading] = useState(true);
        const settingsPersistenceSession = {};
        sync({ ...extra, settingsPersistenceSession, setLoading });
        return loading;
      }`
    );

    expect(metric.stateAuthorityNames).toEqual(['setLoading']);
  });
});
