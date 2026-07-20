import type { CommandPaletteAction, CommandPaletteGroup } from './types';

const MAX_RECENT_ACTIONS = 5;

function normalizeText(value: string): string {
  return value.toLowerCase().trim();
}

function isSubsequence(needle: string, haystack: string): boolean {
  if (!needle) {
    return true;
  }

  let index = 0;

  for (const character of haystack) {
    if (character === needle[index]) {
      index += 1;
    }

    if (index === needle.length) {
      return true;
    }
  }

  return false;
}

function buildActionSearchText(action: CommandPaletteAction): string[] {
  return [
    action.title,
    action.subtitle ?? '',
    action.section ?? '',
    action.shortcut ?? '',
    ...(action.keywords ?? []),
  ].map(normalizeText);
}

function queryMatchesAction(tokens: string[], haystacks: string[], title: string): boolean {
  for (const token of tokens) {
    const matchesToken =
      haystacks.some((value) => value.includes(token)) || isSubsequence(token, title);

    if (!matchesToken) {
      return false;
    }
  }

  return true;
}

function getTitleSearchScore(title: string, normalizedQuery: string): number {
  if (title === normalizedQuery) {
    return 500;
  }

  if (title.startsWith(normalizedQuery)) {
    return 320;
  }

  if (title.includes(normalizedQuery)) {
    return 240;
  }

  return isSubsequence(normalizedQuery, title) ? 180 : 0;
}

function getTokenSearchScore(tokens: string[], title: string, searchArea: string): number {
  return tokens.reduce((score, token) => {
    if (title.startsWith(token)) {
      return score + 80;
    }

    if (title.includes(token)) {
      return score + 48;
    }

    return searchArea.includes(token) ? score + 20 : score;
  }, 0);
}

function getActionScore(action: CommandPaletteAction, query: string): number | null {
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery) {
    return 0;
  }

  const title = normalizeText(action.title);
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const haystacks = buildActionSearchText(action);
  const searchArea = haystacks.join(' ');

  if (!queryMatchesAction(tokens, haystacks, title)) {
    return null;
  }

  return (
    getTitleSearchScore(title, normalizedQuery) + getTokenSearchScore(tokens, title, searchArea)
  );
}

export function filterCommandPaletteActions(
  actions: readonly CommandPaletteAction[],
  query: string
): CommandPaletteAction[] {
  if (!query.trim()) {
    return [...actions];
  }

  return actions
    .map((action) => ({
      action,
      score: getActionScore(action, query),
    }))
    .filter((item): item is { action: CommandPaletteAction; score: number } => item.score !== null)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.action.title.localeCompare(right.action.title);
    })
    .map((item) => item.action);
}

export function buildCommandPaletteGroups(
  actions: readonly CommandPaletteAction[],
  recentActionIds: readonly string[],
  query: string
): CommandPaletteGroup[] {
  if (query.trim()) {
    return [
      {
        id: 'results',
        label: 'shared.ui.commandPaletteResultsSection',
        actions: filterCommandPaletteActions(actions, query),
      },
    ];
  }

  const recentActions = recentActionIds
    .map((actionId) => actions.find((action) => action.id === actionId))
    .filter((action): action is CommandPaletteAction => Boolean(action));

  if (recentActions.length === 0) {
    return [
      {
        id: 'all',
        label: 'shared.ui.commandPaletteAllSection',
        actions,
      },
    ];
  }

  return [
    {
      id: 'recent',
      label: 'shared.ui.commandPaletteRecentSection',
      actions: recentActions,
    },
    {
      id: 'all',
      label: 'shared.ui.commandPaletteAllSection',
      actions: actions.filter((action) => !recentActionIds.includes(action.id)),
    },
  ];
}

export function buildRecentCommandPaletteActionIds(
  recentActionIds: readonly string[],
  actionId: string
): string[] {
  return [actionId, ...recentActionIds.filter((id) => id !== actionId)].slice(
    0,
    MAX_RECENT_ACTIONS
  );
}
