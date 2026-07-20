import type { CompactCommand } from '../../inspector/compact';

export function command(id: string): CompactCommand {
  return {
    id,
    title: id,
    trigger: id,
    content: <div>{id}</div>,
  };
}
