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
export { QueueAgain } from './QueueAgain';
export type { QueueAgainProps } from './QueueAgain';
export { ReviewList } from './ReviewList';
export type { ReviewListProps } from './ReviewList';
export { ThreadList } from './ThreadList';
export type { ThreadListProps } from './ThreadList';
