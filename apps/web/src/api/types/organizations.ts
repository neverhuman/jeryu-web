// organizations.ts — organizations with owners and the teams they run (ADR 0009).
//
// The shape is jeryu_core::model Organization / Team / OrganizationView JSON.
// Hand-written beside the other API types.

export interface Organization {
  id: string;
  login: string;
  display_name: string | null;
  created_at: string;
  /** Empty only on an organization from before owners existed. */
  owners: string[];
  created_by: string | null;
}

export interface Team {
  id: string;
  organization: string;
  slug: string;
  name: string;
  members: string[];
  created_at: string;
}

/** `GET /api/v1/orgs/:org`. */
export interface OrganizationView {
  organization: Organization;
  teams: Team[];
  /** The caller may change owners, teams and members. */
  can_manage: boolean;
}

/** `GET /api/v1/orgs`. */
export interface OrganizationListResponse {
  organizations: Organization[];
}

/** `POST /api/v1/orgs`, forge administrators only. */
export interface OrganizationCreateRequest {
  login: string;
  display_name?: string;
  owners: string[];
}

/** `POST /api/v1/orgs/:org/teams`. */
export interface TeamCreateRequest {
  name: string;
  slug?: string;
  members?: string[];
}
