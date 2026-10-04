// SecretsMetadataTable.tsx — list of secret names / scopes / age (W-FE-12).
//
// IMPORTANT — Per §35.2.4 / FINAL §7.4 the SPA never sees secret values.
// This component only renders metadata (name, scope, last rotated, fingerprint).

import { Eye, KeyRound } from 'lucide-react';

import { When } from '../../format/When';

import './settings.css';

export interface SecretMetadata {
  name: string;
  scope: string;
  /** RFC3339 timestamp; rendered relative, with the absolute time on hover. */
  rotated_at: string | null;
  fingerprint: string | null;
}

export interface SecretsMetadataTableProps {
  secrets: SecretMetadata[];
  className?: string;
}

export function SecretsMetadataTable({
  secrets,
  className,
}: SecretsMetadataTableProps): JSX.Element {
  if (secrets.length === 0) {
    return (
      <div className={`secrets-table ${className ?? ''}`.trim()}>
        <p className="secrets-table__empty">
          No secrets configured for this repository.
        </p>
        <p className="secrets-table__hint">
          <Eye aria-hidden="true" size={12} /> Secret values are write-only —
          they are never read back through the web API.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`secrets-table ${className ?? ''}`.trim()}
      aria-label="Secrets"
    >
      <div className="table-scroll">
        <table className="secrets-table__table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Scope</th>
              <th scope="col">Last rotated</th>
              <th scope="col">Fingerprint</th>
            </tr>
          </thead>
          <tbody>
            {secrets.map((secret) => (
              <tr key={`${secret.name}-${secret.scope}`}>
                <th scope="row" className="secrets-table__name">
                  <KeyRound aria-hidden="true" size={12} />
                  {secret.name}
                </th>
                <td>
                  <code>{secret.scope}</code>
                </td>
                <td>
                  <When at={secret.rotated_at} fallback="never rotated" />
                </td>
                <td>
                  {secret.fingerprint ? (
                    <code className="secrets-table__fingerprint">
                      {secret.fingerprint}
                    </code>
                  ) : (
                    <span className="secrets-table__none">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="secrets-table__hint">
        <Eye aria-hidden="true" size={12} /> Secret values are write-only —
        they are never read back through the web API.
      </p>
    </div>
  );
}
