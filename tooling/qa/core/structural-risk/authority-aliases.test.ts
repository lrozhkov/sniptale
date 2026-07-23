import { describe, expect, it } from 'vitest';

import { analyzeStructuralSource } from './report.mjs';

describe('same-file state authority aliases', () => {
  it('collapses one ref and setter threaded through direct helper calls', () => {
    const metric = analyzeStructuralSource(
      'apps/extension/src/content/overlay/example/index.ts',
      `function start(session, setView) {
        session.current.moved = true;
        setView({ active: true });
      }
      function createMove(props) {
        return () => start(props.session, props.setView);
      }
      function createEnd(props) {
        return () => {
          props.session.current = null;
          props.setView({ active: false });
        };
      }
      function useLifecycle(props) {
        const { session, setView } = props;
        createMove({ session, setView });
        createEnd({ session, setView });
      }
      export function useInteraction() {
        const session = useRef(null);
        const [view, setView] = useState({ active: false });
        useLifecycle({ session, setView });
        return view;
      }`
    );

    expect(metric.stateAuthorities).toBe(2);
    expect(metric.stateAuthorityNames).toEqual(['session', 'setView']);
    expect(metric.stateReceiverKeys).toHaveLength(1);
    expect(metric.unresolvedStateAuthorityKeys).toHaveLength(1);
  });

  it('keeps one helper called with multiple receivers distinct', () => {
    const metric = analyzeStructuralSource(
      'apps/extension/src/content/selection/state.ts',
      `function update(target) { target.ready = true; }
      export function run(first, second) {
        update(first);
        update(second);
      }`
    );

    expect(metric.stateAuthorities).toBe(2);
    expect(metric.stateAuthorityNames).toEqual(['first', 'second']);
  });

  it('retains an unresolved helper parameter conservatively', () => {
    const metric = analyzeStructuralSource(
      'apps/extension/src/content/selection/state.ts',
      `function update(target) { target.ready = true; }
      export function run(first, factory) {
        update(first);
        update(factory());
      }`
    );

    expect(metric.stateAuthorities).toBe(2);
    expect(metric.stateAuthorityNames).toEqual(['first', 'target']);
  });

  it('bounds recursive and mutually recursive parameter alias resolution', () => {
    const recursive = analyzeStructuralSource(
      'apps/extension/src/content/selection/state.ts',
      `export function update(target) {
        target.ready = true;
        if (target.next) update(target.next);
      }`
    );
    const mutual = analyzeStructuralSource(
      'apps/extension/src/content/selection/state.ts',
      `function update(target) {
        target.ready = true;
        if (target.next) continueUpdate(target.next);
      }
      function continueUpdate(target) {
        target.complete = true;
        if (target.next) update(target.next);
      }
      export function run(first) { update(first); }`
    );

    expect(recursive.stateAuthorityNames).toEqual(['target', 'target.next']);
    expect(mutual.stateAuthorityNames).toContain('first');
    expect(mutual.stateAuthorities).toBeLessThan(10);
  });

  it('retains external authority for a transparent default-exported helper', () => {
    const metric = analyzeStructuralSource(
      'apps/extension/src/content/selection/state.ts',
      `export default (function update(target) {
        target.ready = true;
        if (target.next) update(target.next);
      });`
    );

    expect(metric.stateAuthorityNames).toEqual(['target', 'target.next']);
  });
});

describe('conservative state authority boundaries', () => {
  it('retains the parameter authority when the helper is exported', () => {
    const metric = analyzeStructuralSource(
      'apps/extension/src/content/selection/state.ts',
      `export function update(target) { target.ready = true; }
      export function run(first) { update(first); }`
    );

    expect(metric.stateAuthorities).toBe(2);
    expect(metric.stateAuthorityNames).toEqual(['first', 'target']);
  });

  it('retains the parameter authority when the helper escapes as a callback', () => {
    const metric = analyzeStructuralSource(
      'apps/extension/src/content/selection/state.ts',
      `function update(target) { target.ready = true; }
      export function run(first, list) {
        update(first);
        list.forEach(update);
      }`
    );

    expect(metric.stateAuthorities).toBe(2);
    expect(metric.stateAuthorityNames).toEqual(['first', 'target']);
  });

  it('does not collapse a runtime-computed element access into a static property', () => {
    const metric = analyzeStructuralSource(
      'apps/extension/src/content/selection/state.ts',
      `function update(target) { target.ready = true; }
      export function run(receivers, key) {
        update(receivers.key);
        update(receivers[key]);
      }`
    );

    expect(metric.stateAuthorities).toBe(2);
    expect(metric.stateAuthorityNames).toEqual(['receivers.key', 'target']);
  });

  it('keeps dotted string property segments collision-safe', () => {
    const metric = analyzeStructuralSource(
      'apps/extension/src/content/selection/state.ts',
      `function update(target) { target.ready = true; }
      export function run(receivers) {
        update(receivers['first.value']);
        update(receivers['first.other']);
      }`
    );

    expect(metric.stateAuthorities).toBe(2);
    expect(metric.stateAuthorityNames).toEqual(['receivers.first.other', 'receivers.first.value']);
  });

  it('keeps an empty string property segment distinct from its receiver', () => {
    const metric = analyzeStructuralSource(
      'apps/extension/src/content/selection/state.ts',
      `function update(target) { target.ready = true; }
      export function run(receivers) {
        update(receivers);
        update(receivers['']);
      }`
    );

    expect(metric.stateAuthorities).toBe(2);
    expect(metric.stateAuthorityNames).toEqual(['receivers', 'receivers.']);
  });
});
