// merge/index.ts — barrel exports for the merge cockpit (W-FE-11).

export { DiffFileTree } from './DiffFileTree';
export type { DiffFileTreeProps } from './DiffFileTree';
export { DiffViewer } from './DiffViewer';
export type { DiffViewerProps, DiffViewerMode } from './DiffViewer';
export { InlineComment } from './InlineComment';
export type {
  InlineCommentProps,
  InlineCommentComposeProps,
  InlineCommentDisplayProps,
} from './InlineComment';
export { ChecksPanel } from './ChecksPanel';
export type { ChecksPanelProps } from './ChecksPanel';
export { MergeBox } from './MergeBox';
export type { MergeBoxProps } from './MergeBox';
export { gateExplanation } from './passportGates';
export { mergeGateReasons, pendingGateRun } from './mergeGateModel';
export type { MergeGateReason } from './mergeGateModel';
export {
  ownerPathHeadline,
  ownerPathRows,
  ownerStandingNote,
  showOwnerPaths,
} from './ownerPathsModel';
export type { OwnerPathRow } from './ownerPathsModel';
export { QueueToMerge } from './QueueToMerge';
export type { QueueToMergeProps } from './QueueToMerge';
export { ReviewHeads } from './ReviewHeads';
export type { ReviewHeadsProps } from './ReviewHeads';
export { reviewHeadLine, reviewHeads } from './reviewHeadsModel';
export type { ReviewHeadRow, ReviewHeadState } from './reviewHeadsModel';
export { ReviewEntry, ReviewList, useReviewAnchors } from './ReviewList';
export type { ReviewListProps } from './ReviewList';
export { ThreadCard, ThreadList } from './ThreadList';
export type { ThreadListProps } from './ThreadList';
