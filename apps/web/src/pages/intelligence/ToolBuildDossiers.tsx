// ToolBuildDossiers.tsx - tool-build cluster dossiers panel.

import type { ControlPlaneSnapshot, ToolBuildCluster } from '../../api/types';

import { formatScore, toolBuildSeverity } from './graphHelpers';
import { SeverityPill } from './StateIndicators';

export function ToolBuildDossiers({
  clusters,
  summaryClusters,
  unavailable,
}: {
  clusters: ToolBuildCluster[];
  summaryClusters: ControlPlaneSnapshot['toolBuild']['topClusters'];
  unavailable: string | null;
}): JSX.Element {
  const rows =
    clusters.length > 0
      ? clusters.map((cluster) => ({
          id: cluster.cluster_id,
          repo: cluster.repo_id,
          score: cluster.score,
          occurrences: cluster.occurrence_count,
          files: cluster.file_count,
          language: cluster.language,
          insight: cluster.insight,
        }))
      : summaryClusters.map((cluster) => ({
          id: cluster.clusterId,
          repo: cluster.repoId,
          score: cluster.score,
          occurrences: cluster.occurrenceCount,
          files: cluster.fileCount,
          language: 'unknown',
          insight: cluster.insight,
        }));
  const topScore = Math.max(0, ...rows.map((row) => row.score));
  return (
    <div className="intelligence__dossiers" data-testid="tool-build-dossiers">
      <div className="intelligence__section-head">
        <h3>Tool-build clusters</h3>
        {unavailable ? <span className="page__pill">unavailable</span> : null}
      </div>
      {unavailable ? <p>{unavailable}</p> : null}
      {rows.length === 0 ? (
        <p>No tool-build clusters available.</p>
      ) : (
        <div className="intelligence__dossier-grid">
          {rows.slice(0, 6).map((row) => (
            <article className="intelligence__dossier" key={row.id}>
              <div className="intelligence__dossier-top">
                <strong>{row.repo}</strong>
                <SeverityPill severity={toolBuildSeverity(row.score, topScore)} />
              </div>
              <p>{row.insight}</p>
              <div className="intelligence__dossier-meta">
                <span>{row.occurrences} occurrences</span>
                <span>{row.files} files</span>
                <span>{row.language}</span>
                <span>score {formatScore(row.score)}</span>
                <span title={`Cluster fingerprint ${row.id}`}>
                  cluster {row.id}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
