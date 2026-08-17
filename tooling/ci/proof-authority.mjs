export function assertProofAuthority(initial, current) {
  if (current.worktreeStatus !== '') {
    throw new Error('ci:proof worktree changed while proof lanes were running.');
  }
  if (current.localSha !== initial.localSha) {
    throw new Error('ci:proof local HEAD changed while proof lanes were running.');
  }
  if (
    current.pr.headRefOid !== initial.pr.headRefOid ||
    current.pr.baseRefOid !== initial.pr.baseRefOid ||
    current.pr.url !== initial.pr.url ||
    current.pr.author?.login !== initial.pr.author?.login
  ) {
    throw new Error('ci:proof PR head or base changed while proof lanes were running.');
  }
}
