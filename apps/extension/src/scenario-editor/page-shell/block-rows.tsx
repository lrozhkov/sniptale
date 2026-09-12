import type { ReactNode } from 'react';
import type { GuideBlock } from '@sniptale/runtime-contracts/scenario/types/guide';
import { splitGuideBlockRows } from '../../features/scenario/project/public';

/** Local boundaries share one rendering path; omitted reader content cannot erase a boundary. */
export function GuideBlockRows({
  blocks,
  visible,
  children,
}: {
  blocks: readonly GuideBlock[];
  visible?: (block: GuideBlock) => boolean;
  children: (block: GuideBlock, index: number) => ReactNode;
}) {
  return splitGuideBlockRows(blocks).map((segment) => {
    const content = visible ? segment.filter(visible) : segment;
    return content.length ? (
      <div className="guide-block-row" key={segment[0]!.rowStart ? segment[0]!.id : 'automatic'}>
        {content.map((block) => children(block, blocks.indexOf(block)))}
      </div>
    ) : null;
  });
}
