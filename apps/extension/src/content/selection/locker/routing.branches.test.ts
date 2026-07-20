// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

type ResolvedTargets = {
  interactiveTarget: HTMLElement | null;
  navigationTarget: HTMLElement | null;
};

const modeSession = vi.hoisted(() => ({
  isContentModeEnabled: vi.fn(() => false),
}));
const routingGuards = vi.hoisted(() => ({
  blockEvent: vi.fn(),
  getLockRoutingTarget: vi.fn(),
  handleClosestLink: vi.fn(() => false),
  handleResolvedNavigationTarget: vi.fn(() => false),
  resolveLockTargets: vi.fn<(event: Event) => ResolvedTargets>(() => ({
    interactiveTarget: null,
    navigationTarget: null,
  })),
  shouldAllowQuickEditTarget: vi.fn(() => false),
  shouldBlockQuickEditInteractiveTarget: vi.fn(() => false),
}));

vi.mock('../../application/mode-session', () => modeSession);
vi.mock('./routing.guards', () => routingGuards);

import { routeLockInteractionEvent } from './routing';

function createResolvedTargets(args: {
  interactiveTarget?: HTMLElement | null;
  navigationTarget?: HTMLElement | null;
}): ResolvedTargets {
  return {
    interactiveTarget: args.interactiveTarget ?? null,
    navigationTarget: args.navigationTarget ?? null,
  };
}

function createState() {
  return {
    isFullLockMode: false,
    isNavigationLocked: true,
    isUIHidden: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  modeSession.isContentModeEnabled.mockReturnValue(false);
  routingGuards.handleClosestLink.mockReturnValue(false);
  routingGuards.handleResolvedNavigationTarget.mockReturnValue(false);
  routingGuards.resolveLockTargets.mockReturnValue(createResolvedTargets({}));
  routingGuards.shouldAllowQuickEditTarget.mockReturnValue(false);
  routingGuards.shouldBlockQuickEditInteractiveTarget.mockReturnValue(false);
});

function shouldReturnEarlyWithoutRoutingTarget(): void {
  routingGuards.getLockRoutingTarget.mockReturnValueOnce(null);

  routeLockInteractionEvent(new MouseEvent('click'), createState());

  expect(routingGuards.resolveLockTargets).not.toHaveBeenCalled();
}

function shouldContinueRoutingForSelectionDelegation(): void {
  const target = document.createElement('button');
  routingGuards.getLockRoutingTarget.mockReturnValueOnce(target);

  routeLockInteractionEvent(new MouseEvent('click'), createState());

  expect(routingGuards.shouldAllowQuickEditTarget).toHaveBeenCalledWith(target);
}

function shouldReturnEarlyForAllowedQuickEditTargets(): void {
  const target = document.createElement('button');
  routingGuards.getLockRoutingTarget.mockReturnValueOnce(target);
  routingGuards.shouldAllowQuickEditTarget.mockReturnValueOnce(true);

  routeLockInteractionEvent(new MouseEvent('click'), createState());

  expect(routingGuards.shouldBlockQuickEditInteractiveTarget).not.toHaveBeenCalled();
}

function shouldReturnEarlyWhenQuickEditAlreadyBlockedTheEvent(): void {
  const target = document.createElement('button');
  routingGuards.getLockRoutingTarget.mockReturnValueOnce(target);
  routingGuards.shouldBlockQuickEditInteractiveTarget.mockReturnValueOnce(true);

  routeLockInteractionEvent(new MouseEvent('click'), createState());

  expect(routingGuards.handleResolvedNavigationTarget).not.toHaveBeenCalled();
}

function shouldReturnEarlyForEditingTargets(): void {
  const target = document.createElement('div');
  target.classList.add('sniptale-editing');
  routingGuards.getLockRoutingTarget.mockReturnValueOnce(target);

  routeLockInteractionEvent(new MouseEvent('click'), createState());

  expect(routingGuards.handleResolvedNavigationTarget).not.toHaveBeenCalled();
}

function shouldReturnEarlyWhenClosestLinkHandlesTheEvent(): void {
  const target = document.createElement('button');
  routingGuards.getLockRoutingTarget.mockReturnValueOnce(target);
  routingGuards.handleClosestLink.mockReturnValueOnce(true);

  routeLockInteractionEvent(new MouseEvent('click'), createState());

  expect(routingGuards.blockEvent).not.toHaveBeenCalled();
}

function shouldReturnEarlyWithoutInteractiveTargets(): void {
  const target = document.createElement('button');
  routingGuards.getLockRoutingTarget.mockReturnValueOnce(target);
  routingGuards.resolveLockTargets.mockReturnValueOnce(createResolvedTargets({}));

  routeLockInteractionEvent(new MouseEvent('click'), createState());

  expect(routingGuards.blockEvent).not.toHaveBeenCalled();
}

function shouldReturnEarlyWhenNoLockModeRequiresBlocking(): void {
  const target = document.createElement('button');
  routingGuards.getLockRoutingTarget.mockReturnValueOnce(target);
  routingGuards.resolveLockTargets.mockReturnValueOnce(
    createResolvedTargets({ interactiveTarget: document.createElement('button') })
  );

  routeLockInteractionEvent(new MouseEvent('click'), createState());

  expect(routingGuards.blockEvent).not.toHaveBeenCalled();
}

function shouldBlockInteractiveTargetsWhenQuickEditModeIsActive(): void {
  const target = document.createElement('button');
  const interactiveTarget = document.createElement('button');
  const event = new MouseEvent('click');
  routingGuards.getLockRoutingTarget.mockReturnValueOnce(target);
  routingGuards.resolveLockTargets.mockReturnValueOnce(
    createResolvedTargets({ interactiveTarget })
  );
  modeSession.isContentModeEnabled.mockReturnValueOnce(true);

  routeLockInteractionEvent(event, createState());

  expect(routingGuards.blockEvent).toHaveBeenCalledWith(event);
}

describe('locker routing branches', () => {
  it('returns early when no routing target is resolved', shouldReturnEarlyWithoutRoutingTarget);
  it(
    'continues routing for selection-delegated mode so interactive targets can still be blocked',
    shouldContinueRoutingForSelectionDelegation
  );
  it('returns early for allowed quick-edit targets', shouldReturnEarlyForAllowedQuickEditTargets);
  it(
    'returns early when quick-edit handling already blocked the event',
    shouldReturnEarlyWhenQuickEditAlreadyBlockedTheEvent
  );
  it('returns early for editing targets', shouldReturnEarlyForEditingTargets);
  it(
    'returns early when the closest-link guard handles the event',
    shouldReturnEarlyWhenClosestLinkHandlesTheEvent
  );
  it(
    'returns early when no interactive target is available',
    shouldReturnEarlyWithoutInteractiveTargets
  );
  it(
    'returns early when neither full-lock nor quick-edit mode requires blocking',
    shouldReturnEarlyWhenNoLockModeRequiresBlocking
  );
  it(
    'blocks interactive targets when quick-edit mode is active',
    shouldBlockInteractiveTargetsWhenQuickEditModeIsActive
  );
});
