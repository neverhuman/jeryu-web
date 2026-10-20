// incidents.ts — wire types for reporting an incident:
//
//   POST /api/v1/incidents
//
// Global admins and JERYU_EVENT_REPORTERS logins may post. Only `summary` is
// required; the server generates `incident_id` when none is sent, and one
// submission may open, attribute, restore and close the incident at once.
// Times are RFC 3339.

export interface IncidentReportRequest {
  /** 1–64 characters of `[A-Za-z0-9._:-]`; the same id on a retry adds nothing twice. */
  incident_id?: string;
  /** One line saying what is wrong. */
  summary: string;
  service?: string;
  severity?: string;
  family?: string;
  repo?: string;
  detected_at?: string;
  restored_at?: string;
  restoring_change?: string;
  /** Change lot keys that caused it; at most 50, each at most 200 characters. */
  changes?: string[];
  closed?: boolean;
  closed_at?: string;
}

export interface IncidentReportResponse {
  schema_version: string;
  ok: boolean;
  incident_id: string;
  seqs: number[];
}
