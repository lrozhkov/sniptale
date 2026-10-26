// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useDesignReviewChecks } from './checks';
import type { ReviewCheckResult } from '../../../selection/design-review/checks/scan';
const scan = vi.hoisted(() => vi.fn());
vi.mock('../../../selection/design-review/checks/scan', () => ({
  scanDesignReviewChecks: scan,
  isReviewCheckRootAvailable: (target: Element) => target.isConnected,
}));
const host = document.createElement('div');
const root = createRoot(host);
let latest: ReturnType<typeof useDesignReviewChecks>;
function Harness(props: { candidate: Element | null; enabled?: boolean; open?: boolean }) {
  latest = useDesignReviewChecks(props.enabled ?? true, props.open ?? true, props.candidate);
  return null;
}
afterEach(async () => {
  await act(async () => root.render(null));
  scan.mockReset();
  document.body.replaceChildren();
});
function result(target: Element, width = 1280): ReviewCheckResult {
  return {
    root: target,
    scope: 'selected',
    rootLabel: target.localName,
    completedAt: 1,
    viewport: { width, height: 560, frame: false },
    visited: 1,
    inspected: 1,
    truncated: false,
    totalFindings: 0,
    findings: [],
    skipped: { hidden: 0, owned: 0, boundaries: 0, unknownNames: 0, unknownContrast: 0 },
  };
}
it('rechecks the accepted root after Show C and takes a new viewport snapshot', async () => {
  const a = document.createElement('section'),
    c = document.createElement('p');
  document.body.append(a, c);
  scan.mockReturnValueOnce(result(a));
  await act(async () => root.render(<Harness candidate={a} />));
  await act(async () => root.render(<Harness candidate={c} />));
  expect(scan).toHaveBeenCalledTimes(1);
  scan.mockReturnValueOnce(result(a, 1920));
  await act(async () => latest.recheck());
  expect(scan).toHaveBeenLastCalledWith(a, 'selected');
  expect(latest.result?.viewport.width).toBe(1920);
  scan.mockReturnValueOnce(result(c));
  await act(async () => latest.newScan());
  expect(scan).toHaveBeenLastCalledWith(c, 'selected');
});
it('preserves a stale result and retries the same identity after removal and recreation', async () => {
  const a = document.createElement('section');
  a.id = 'root';
  document.body.append(a);
  const accepted = result(a);
  scan.mockReturnValueOnce(accepted);
  await act(async () => root.render(<Harness candidate={a} />));
  a.remove();
  const recreated = document.createElement('section');
  recreated.id = 'root';
  document.body.append(recreated);
  await act(async () => root.render(<Harness candidate={recreated} />));
  scan.mockReturnValue(null);
  await act(async () => latest.recheck());
  expect(latest.result).toBe(accepted);
  expect(latest.unavailable).toBe(true);
  await act(async () => latest.recheck());
  expect(scan).toHaveBeenLastCalledWith(a, 'selected');
  await act(async () => root.render(<Harness candidate={recreated} enabled={false} />));
  expect(latest.result).toBeNull();
});

it('uses page scope on first open without a selected element', async () => {
  scan.mockReturnValueOnce({ ...result(document.documentElement), scope: 'page' });
  await act(async () => root.render(<Harness candidate={null} />));
  expect(scan).toHaveBeenLastCalledWith(document.documentElement, 'page');
  expect(latest.scope).toBe('page');
});

it('makes one automatic attempt per session and never retries from rerenders, retargeting or reopening', async () => {
  const a = document.createElement('section');
  const c = document.createElement('section');
  document.body.append(a, c);
  scan.mockReturnValue(null);
  await act(async () => root.render(<Harness candidate={a} />));
  expect(scan).toHaveBeenCalledTimes(1);
  await act(async () => root.render(<Harness candidate={c} />));
  await act(async () => latest.setScope('page'));
  await act(async () => root.render(<Harness candidate={c} open={false} />));
  await act(async () => root.render(<Harness candidate={c} />));
  expect(scan).toHaveBeenCalledTimes(1);
  await act(async () => latest.newScan());
  expect(scan).toHaveBeenCalledTimes(2);
  expect(scan).toHaveBeenLastCalledWith(document.documentElement, 'page');
  await act(async () => root.render(<Harness candidate={c} enabled={false} />));
  await act(async () => root.render(<Harness candidate={c} />));
  expect(scan).toHaveBeenCalledTimes(3);
});
