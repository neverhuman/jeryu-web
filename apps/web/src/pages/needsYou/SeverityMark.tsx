// SeverityMark.tsx — a severity's shape. Rows and group headings share a red
// for "a person is needed", so the shape is what tells broken from blocked
// from worth a look without reading the colour: an octagon, a triangle, an
// eye. The word is the group heading's; the mark is decoration beside it.

import { Eye, OctagonAlert, TriangleAlert, type LucideIcon } from 'lucide-react';

import type { AttentionSeverity } from '../../api/types';
import { SEVERITY_LABEL } from './needsYouModel';

const SHAPE: Record<AttentionSeverity, LucideIcon> = {
  critical: OctagonAlert,
  action: TriangleAlert,
  watch: Eye,
};

export function SeverityMark({ severity }: { severity: AttentionSeverity }): JSX.Element {
  const Shape = SHAPE[severity];
  return (
    <span
      className={`needs-you__severity needs-you__severity--${severity}`}
      title={SEVERITY_LABEL[severity]}
      data-testid={`needs-you-severity-${severity}`}
      aria-hidden="true"
    >
      <Shape size={14} />
    </span>
  );
}
