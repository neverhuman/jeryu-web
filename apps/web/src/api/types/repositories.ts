// repositories.ts — repository wire shapes the generated contracts do not
// carry yet.
//
// `RepositorySummary` is generated from the Rust read-model type. The forge
// adds its canonical links to each serialized row beside that type, so they
// are declared here until the shared contract carries them.

import type { RepositorySummary } from '../../../../../contracts/generated/RepositorySummary';
import type { CanonicalLinks } from './pullRequests';

/** A repository row as the forge serves it, with its canonical links. */
export type RepositoryRow = RepositorySummary & CanonicalLinks;
