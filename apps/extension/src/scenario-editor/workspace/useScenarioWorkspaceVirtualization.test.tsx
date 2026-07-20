// @vitest-environment jsdom

import { useEffect } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createScenarioCaptureStep } from '../../features/scenario/project/public';
import { useScenarioWorkspaceVirtualization } from './useScenarioWorkspaceVirtualization';

type ResizeObserverRecord = {
  callback: ResizeObserverCallback;
  disconnectCount: number;
  nodes: Set<Element>;
};

const resizeObserverRecords: ResizeObserverRecord[] = [];

class MockResizeObserver {
  private readonly record: ResizeObserverRecord;

  constructor(callback: ResizeObserverCallback) {
    this.record = {
      callback,
      disconnectCount: 0,
      nodes: new Set<Element>(),
    };
    resizeObserverRecords.push(this.record);
  }

  observe(node: Element) {
    this.record.nodes.add(node);
  }

  disconnect() {
    this.record.disconnectCount += 1;
    this.record.nodes.clear();
  }
}

type WorkspaceSnapshot = {
  bindMeasuredHeight: ReturnType<typeof useScenarioWorkspaceVirtualization>['bindMeasuredHeight'];
  totalHeight: number;
  viewportHeight: number;
  visibleKeys: string[];
  workspaceHeight: number;
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createWorkspaceSteps(count: number) {
  return Array.from({ length: count }, (_, index) =>
    createScenarioCaptureStep({
      assetId: `asset-${index + 1}`,
      title: `Capture ${index + 1}`,
    })
  );
}

function setScrollableMetrics(
  node: HTMLDivElement,
  metrics: { clientHeight: number; scrollTop: number }
) {
  Object.defineProperty(node, 'clientHeight', {
    configurable: true,
    value: metrics.clientHeight,
  });
  Object.defineProperty(node, 'scrollTop', {
    configurable: true,
    value: metrics.scrollTop,
    writable: true,
  });
}

function setMeasuredHeight(node: HTMLDivElement, height: number) {
  node.getBoundingClientRect = () =>
    ({
      bottom: height,
      height,
      left: 0,
      right: 0,
      top: 0,
      width: 400,
      x: 0,
      y: 0,
      toJSON: () => '',
    }) as DOMRect;
}

function triggerResize(node?: Element) {
  for (const record of resizeObserverRecords) {
    if (node && !record.nodes.has(node)) {
      continue;
    }

    record.callback([], {} as ResizeObserver);
  }
}

function getLatestSnapshot(onSnapshot: ReturnType<typeof vi.fn>) {
  const latestSnapshot = onSnapshot.mock.calls.at(-1)?.[0] as WorkspaceSnapshot | undefined;
  if (!latestSnapshot) {
    throw new Error('Expected workspace virtualization snapshot');
  }
  return latestSnapshot;
}

async function applyMeasuredHeight(
  bindMeasuredHeight: WorkspaceSnapshot['bindMeasuredHeight'],
  key: string,
  node: HTMLDivElement,
  height: number
) {
  setMeasuredHeight(node, height);

  await act(async () => {
    bindMeasuredHeight(key)(node);
    triggerResize(node);
  });
}

async function scrollWorkspace(node: HTMLDivElement, scrollTop: number) {
  await act(async () => {
    node.scrollTop = scrollTop;
    node.dispatchEvent(new Event('scroll'));
    triggerResize(node);
  });
}

async function cleanupWorkspaceMeasurement(
  bindMeasuredHeight: WorkspaceSnapshot['bindMeasuredHeight'],
  key: string,
  node: HTMLDivElement
) {
  await act(async () => {
    bindMeasuredHeight(key)(node);
    bindMeasuredHeight(key)(null);
    root?.unmount();
  });
  root = null;
}

function WorkspaceVirtualizationProbe(props: {
  node: HTMLDivElement | null;
  onSnapshot: (snapshot: WorkspaceSnapshot) => void;
  steps: ReturnType<typeof createWorkspaceSteps>;
}) {
  const { node, onSnapshot, steps } = props;
  const {
    bindMeasuredHeight,
    scrollContainerRef,
    viewportHeight,
    visibleItems,
    workspaceHeight,
    workspaceWindow,
  } = useScenarioWorkspaceVirtualization(steps);

  useEffect(() => {
    onSnapshot({
      bindMeasuredHeight,
      totalHeight: workspaceWindow.totalHeight,
      viewportHeight,
      visibleKeys: visibleItems.map((item) => item.key),
      workspaceHeight,
    });
  }, [
    bindMeasuredHeight,
    onSnapshot,
    viewportHeight,
    visibleItems,
    workspaceHeight,
    workspaceWindow.totalHeight,
  ]);

  useEffect(() => {
    scrollContainerRef(node);
    return () => scrollContainerRef(null);
  }, [node, scrollContainerRef]);

  return null;
}

async function renderProbe(props: Parameters<typeof WorkspaceVirtualizationProbe>[0]) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<WorkspaceVirtualizationProbe {...props} />);
  });
}

beforeEach(() => {
  resizeObserverRecords.length = 0;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  vi.stubGlobal('requestAnimationFrame', ((callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  }) as typeof window.requestAnimationFrame);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('useScenarioWorkspaceVirtualization', () => {
  it('uses default viewport metrics before a scroll container is attached', async () => {
    const onSnapshot = vi.fn();

    await renderProbe({
      node: null,
      onSnapshot,
      steps: createWorkspaceSteps(1),
    });

    expect(getLatestSnapshot(onSnapshot)).toEqual(
      expect.objectContaining({
        totalHeight: 1084,
        viewportHeight: 900,
        workspaceHeight: 1084,
      })
    );
  });

  it('tracks scroll position and measured heights through stable owner-local callbacks', async () => {
    const onSnapshot = vi.fn();
    const scrollNode = document.createElement('div');
    const measuredNode = document.createElement('div');
    const steps = createWorkspaceSteps(6);

    setScrollableMetrics(scrollNode, { clientHeight: 240, scrollTop: 0 });
    await renderProbe({ node: scrollNode, onSnapshot, steps });

    const initialSnapshot = getLatestSnapshot(onSnapshot);
    const initialTotalHeight = initialSnapshot.totalHeight;
    const stepKey = `step-${steps[0]?.id}`;
    const bindMeasuredHeight = initialSnapshot.bindMeasuredHeight;

    expect(bindMeasuredHeight(stepKey)).toBe(initialSnapshot.bindMeasuredHeight(stepKey));
    expect(initialSnapshot.viewportHeight).toBe(240);
    expect(initialSnapshot.visibleKeys).toContain('insert-0');

    await applyMeasuredHeight(bindMeasuredHeight, stepKey, measuredNode, 0);
    expect(getLatestSnapshot(onSnapshot).totalHeight).toBe(initialTotalHeight);

    await applyMeasuredHeight(bindMeasuredHeight, stepKey, measuredNode, 600);
    expect(getLatestSnapshot(onSnapshot).totalHeight).not.toBe(initialTotalHeight);

    await scrollWorkspace(scrollNode, 4500);
    expect(getLatestSnapshot(onSnapshot).visibleKeys).not.toContain('insert-0');

    await cleanupWorkspaceMeasurement(bindMeasuredHeight, stepKey, measuredNode);
    expect(resizeObserverRecords.every((record) => record.disconnectCount > 0)).toBe(true);
  });
});
