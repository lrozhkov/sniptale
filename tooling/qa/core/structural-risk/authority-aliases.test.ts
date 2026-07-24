import { describe, expect, it } from 'vitest';

import { analyzeStructuralSource } from './report.mjs';

const analyzeSelectionState = (source: string) =>
  analyzeStructuralSource('apps/extension/src/content/selection/state.ts', source);

describe('same-file state authority aliases', () => {
  it('normalizes aliases under one proven React ref current root', () => {
    const metric = analyzeSelectionState(
      `import { useRef, useState } from 'react';
      function update(lifecycleRef, setDraft) {
        const lifecycle = lifecycleRef.current;
        lifecycle.previousOpen = true;
        lifecycle.dirty.blur = true;
        setDraft({ ready: true });
      }
      export function useLifecycle() {
        const lifecycleRef = useRef({ previousOpen: false, dirty: { blur: false } });
        const [draft, setDraft] = useState({ ready: false });
        update(lifecycleRef, setDraft);
        return draft;
      }`
    );

    expect(metric.stateAuthorities).toBe(2);
    expect(metric.stateAuthorityNames).toEqual(['lifecycleRef', 'setDraft']);
    expect(metric.stateReceiverCount).toBe(1);
  });

  it('keeps different proven React refs distinct through one helper', () => {
    const metric = analyzeSelectionState(
      `import React from 'react';
      function update(target) {
        const state = target.current;
        state.ready = true;
      }
      export function useLifecycle() {
        const first = React.useRef({ ready: false });
        const second = React.useRef({ ready: false });
        update(first);
        update(second);
      }`
    );

    expect(metric.stateAuthorities).toBe(2);
    expect(metric.stateAuthorityNames).toEqual(['first', 'second']);
  });
});

describe('conservative React ref provenance', () => {
  it('does not collapse nested authorities on a plain object receiver', () => {
    const metric = analyzeSelectionState(
      `export function update(state) {
        state.primary.ready = true;
        state.secondary.ready = true;
      }`
    );

    expect(metric.stateAuthorityNames).toEqual(['state.primary', 'state.secondary']);
  });
});

describe('React ref lexical shadowing', () => {
  it('does not treat a shadowed named React import as proven useRef provenance', () => {
    const metric = analyzeSelectionState(
      `import { useRef } from 'react';
      export function createState(useRef) {
        const stateRef = useRef();
        const state = stateRef.current;
        state.primary.ready = true;
        state.secondary.ready = true;
      }`
    );

    expect(metric.stateAuthorityNames).toEqual(['stateRef.primary', 'stateRef.secondary']);
  });

  it('does not treat a shadowed React namespace as proven useRef provenance', () => {
    const metric = analyzeSelectionState(
      `import * as React from 'react';
      export function createState(React) {
        const stateRef = React.useRef();
        const state = stateRef.current;
        state.primary.ready = true;
        state.secondary.ready = true;
      }`
    );

    expect(metric.stateAuthorityNames).toEqual(['stateRef.primary', 'stateRef.secondary']);
  });

  it('does not overlook a nested hoisted var shadowing a named React import', () => {
    const metric = analyzeSelectionState(
      `import { useRef } from 'react';
      export function createState(flag, makeRef) {
        if (flag) { var useRef = makeRef; }
        const stateRef = useRef();
        const state = stateRef.current;
        state.primary.ready = true;
        state.secondary.ready = true;
      }`
    );

    expect(metric.stateAuthorityNames).toEqual(['stateRef.primary', 'stateRef.secondary']);
  });

  it('does not overlook a loop var shadowing a React namespace', () => {
    const metric = analyzeSelectionState(
      `import * as React from 'react';
      export function createState(values) {
        for (var React of values) { consume(React); }
        const stateRef = React.useRef();
        const state = stateRef.current;
        state.primary.ready = true;
        state.secondary.ready = true;
      }`
    );

    expect(metric.stateAuthorityNames).toEqual(['stateRef.primary', 'stateRef.secondary']);
  });
});

describe('React ref closure provenance', () => {
  it('rejects a named import shadow captured from an ancestor var scope', () => {
    const metric = analyzeSelectionState(
      `import { useRef } from 'react';
      function outer(flag, makeRef) {
        if (flag) { var useRef = makeRef; }
        function inner() {
          const stateRef = useRef();
          const state = stateRef.current;
          state.primary.ready = true;
          state.secondary.ready = true;
        }
        inner();
      }
      export function run(flag, makeRef) { outer(flag, makeRef); }`
    );

    expect(metric.stateAuthorityNames).toEqual(['stateRef.primary', 'stateRef.secondary']);
  });

  it('rejects a namespace import shadow captured by an arrow closure', () => {
    const metric = analyzeSelectionState(
      `import * as React from 'react';
      function outer(values) {
        for (var React of values) { consume(React); }
        const inner = () => {
          const stateRef = React.useRef();
          const state = stateRef.current;
          state.primary.ready = true;
          state.secondary.ready = true;
        };
        inner();
      }
      export function run(values) { outer(values); }`
    );

    expect(metric.stateAuthorityNames).toEqual(['stateRef.primary', 'stateRef.secondary']);
  });

  it('keeps genuine import provenance when only a child scope shadows the name', () => {
    const metric = analyzeSelectionState(
      `import * as React from 'react';
      export function useLifecycle(makeRef) {
        function unrelated(flag) {
          if (flag) { var React = makeRef; }
          return React;
        }
        const lifecycleRef = React.useRef({ primary: {}, secondary: {} });
        const state = lifecycleRef.current;
        state.primary.ready = true;
        state.secondary.ready = true;
        unrelated(false);
      }`
    );

    expect(metric.stateAuthorities).toBe(1);
    expect(metric.stateAuthorityNames).toEqual(['lifecycleRef']);
  });
});

describe('conservative React ref boundaries', () => {
  it('does not collapse a mutable ref binding after possible reassignment', () => {
    const metric = analyzeSelectionState(
      `import { useRef } from 'react';
      export function useLifecycle(replacement, shouldReplace) {
        let lifecycleRef = useRef({ primary: {}, secondary: {} });
        if (shouldReplace) lifecycleRef = replacement;
        const state = lifecycleRef.current;
        state.primary.ready = true;
        state.secondary.ready = true;
      }`
    );

    expect(metric.stateAuthorityNames).toEqual(['lifecycleRef.primary', 'lifecycleRef.secondary']);
  });

  it('keeps dynamic ref aliases conservative', () => {
    const metric = analyzeSelectionState(
      `import { useRef } from 'react';
      export function useLifecycle(key) {
        const first = useRef({ ready: false });
        const second = useRef({ ready: false });
        const refs = { first, second };
        const state = refs[key].current;
        state.ready = true;
      }`
    );

    expect(metric.stateAuthorityNames).toEqual(['state']);
  });

  it('retains an escaped helper parameter alongside its proven React ref caller', () => {
    const metric = analyzeSelectionState(
      `import { useRef } from 'react';
      export function update(target) {
        const state = target.current;
        state.ready = true;
      }
      export function useLifecycle() {
        const lifecycleRef = useRef({ ready: false });
        update(lifecycleRef);
      }`
    );

    expect(metric.stateAuthorities).toBe(2);
    expect(metric.stateAuthorityNames).toEqual(['lifecycleRef', 'target']);
  });
});

describe('same-file helper authority aliases', () => {
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
    const metric = analyzeSelectionState(
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
    const metric = analyzeSelectionState(
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
    const recursive = analyzeSelectionState(
      `export function update(target) {
        target.ready = true;
        if (target.next) update(target.next);
      }`
    );
    const mutual = analyzeSelectionState(
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
    const metric = analyzeSelectionState(
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
    const metric = analyzeSelectionState(
      `export function update(target) { target.ready = true; }
      export function run(first) { update(first); }`
    );

    expect(metric.stateAuthorities).toBe(2);
    expect(metric.stateAuthorityNames).toEqual(['first', 'target']);
  });

  it('retains the parameter authority when the helper escapes as a callback', () => {
    const metric = analyzeSelectionState(
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
    const metric = analyzeSelectionState(
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
    const metric = analyzeSelectionState(
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
    const metric = analyzeSelectionState(
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
