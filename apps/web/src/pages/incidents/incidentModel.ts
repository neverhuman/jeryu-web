// incidentModel.ts — the Report incident form as plain data: what the reporter
// typed, what is wrong with it, and the request it becomes. The server checks
// the same limits; checking them here puts the message next to the field.

import type { IncidentReportRequest } from '../../api/types';

export const REPORT_INCIDENT_PATH = '/report-incident';

/** The server accepts at most this many change keys, each at most this long. */
export const MAX_CHANGES = 50;
export const MAX_CHANGE_CHARS = 200;
export const MAX_INCIDENT_ID_CHARS = 64;

export const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;

export interface IncidentForm {
  summary: string;
  service: string;
  severity: string;
  repo: string;
  /** `datetime-local` values, read as the browser's local time. */
  detectedAt: string;
  restoredAt: string;
  restoringChange: string;
  /** One change key per line, or comma separated. */
  changes: string;
  closed: boolean;
}

export const EMPTY_FORM: IncidentForm = {
  summary: '',
  service: '',
  severity: '',
  repo: '',
  detectedAt: '',
  restoredAt: '',
  restoringChange: '',
  changes: '',
  closed: false,
};

export type FormField = keyof IncidentForm;
export type FormErrors = Partial<Record<FormField, string>>;

/** The change keys typed, trimmed, without blanks or repeats. */
export function parseChanges(raw: string): string[] {
  const keys = raw
    .split(/[\n,]/)
    .map((key) => key.trim())
    .filter((key) => key !== '');
  return [...new Set(keys)];
}

/** `datetime-local` text as an RFC 3339 instant; null when it is not a time. */
export function toInstant(local: string): string | null {
  if (local.trim() === '') return null;
  const at = new Date(local);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

export function validate(form: IncidentForm): FormErrors {
  const errors: FormErrors = {};
  if (form.summary.trim() === '') errors.summary = 'Say in one line what is wrong.';
  if (form.repo.trim() !== '' && !/^[^/\s]+\/[^/\s]+$/.test(form.repo.trim())) {
    errors.repo = 'Use owner/name, for example owner/name.';
  }
  if (form.detectedAt !== '' && toInstant(form.detectedAt) === null) {
    errors.detectedAt = 'Not a date and time.';
  }
  if (form.restoredAt !== '' && toInstant(form.restoredAt) === null) {
    errors.restoredAt = 'Not a date and time.';
  }
  const detected = toInstant(form.detectedAt);
  const restored = toInstant(form.restoredAt);
  if (detected && restored && restored < detected) {
    errors.restoredAt = 'Restored cannot be before it was detected.';
  }
  const keys = parseChanges(form.changes);
  if (keys.length > MAX_CHANGES) {
    errors.changes = `At most ${MAX_CHANGES} changes.`;
  } else if (keys.some((key) => key.length > MAX_CHANGE_CHARS || /[\u0000-\u001f\u007f]/.test(key))) {
    errors.changes = `Each change key is at most ${MAX_CHANGE_CHARS} characters, without control characters.`;
  }
  return errors;
}

/** A fresh incident id, minted once per form so a retry names the same incident. */
export function newIncidentId(now: Date = new Date(), random: () => string = randomToken): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  return `inc-${stamp}-${random()}`;
}

function randomToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  }
  return Math.random().toString(16).slice(2, 10).padEnd(8, '0');
}

/** The request for a valid form; fields left empty are left out. */
export function toRequest(form: IncidentForm, incidentId: string, family?: string): IncidentReportRequest {
  const body: IncidentReportRequest = { incident_id: incidentId, summary: form.summary.trim() };
  const put = (key: 'service' | 'severity' | 'repo' | 'restoring_change', value: string): void => {
    if (value.trim() !== '') body[key] = value.trim();
  };
  put('service', form.service);
  put('severity', form.severity);
  put('repo', form.repo);
  put('restoring_change', form.restoringChange);
  if (family) body.family = family;
  const detected = toInstant(form.detectedAt);
  if (detected) body.detected_at = detected;
  const restored = toInstant(form.restoredAt);
  if (restored) body.restored_at = restored;
  const changes = parseChanges(form.changes);
  if (changes.length > 0) body.changes = changes;
  if (form.closed) body.closed = true;
  return body;
}
