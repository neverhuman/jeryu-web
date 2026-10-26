// ReportIncidentPage.tsx — report an incident at `/report-incident`.
//
// One required field, what is wrong. Everything else is what the reporter
// already knows; what they learn later is a second report on the same
// incident. Posting needs a global admin or an event reporter, so the server's
// 401/403 is shown as a plain "not allowed", and a server without the route
// (404 or the SPA shell) as "not available on this server version".

import { CheckCircle2, ServerOff } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';

import type { ApiError } from '../../api/client';
import type { IncidentReportResponse } from '../../api/types';
import { ActionButton } from '../../components/action/ActionButton';
import { useFamilyScope } from '../../components/family/FamilyScopeProvider';
import { PageHeader } from '../../components/pageHeader';
import { EmptyState, PermissionDeniedState } from '../../components/state';
import { usePageTitle } from '../../hooks/usePageTitle';
import { isPipelineForbidden, isPipelineUnavailable } from '../../hooks/usePipeline';
import { useReportIncident } from '../../hooks/useReportIncident';
import {
  EMPTY_FORM,
  MAX_INCIDENT_ID_CHARS,
  SEVERITIES,
  newIncidentId,
  toRequest,
  validate,
  type FormErrors,
  type IncidentForm,
} from './incidentModel';

import '../page.css';
import './Incidents.css';

export function ReportIncidentPage(): JSX.Element {
  usePageTitle('Report incident');
  const scope = useFamilyScope();
  const report = useReportIncident();
  const [form, setForm] = useState<IncidentForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [filed, setFiled] = useState<IncidentReportResponse | null>(null);
  // One id per form, kept across failed attempts; a new one only after success.
  const incidentId = useRef<string>(newIncidentId().slice(0, MAX_INCIDENT_ID_CHARS));

  const set = <K extends keyof IncidentForm>(key: K, value: IncidentForm[K]): void =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (report.isPending) return;
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    report.mutate(toRequest(form, incidentId.current, scope.family || undefined), {
      onSuccess: (done) => {
        setFiled(done);
        setForm(EMPTY_FORM);
        incidentId.current = newIncidentId().slice(0, MAX_INCIDENT_ID_CHARS);
      },
    });
  };

  return (
    <div className="page" data-testid="report-incident-page">
      <PageHeader
        title="Report incident"
        testId="report-incident-header"
        subtitle="Tell the incident ledger something is wrong. Only the summary is required; add what you know now and report again on the same incident later."
      />

      {filed ? (
        <p className="page__note" role="status" data-testid="report-incident-done">
          <CheckCircle2 aria-hidden="true" size={16} /> Reported incident{' '}
          <code>{filed.incident_id}</code>.
        </p>
      ) : null}

      {report.isError ? <SubmitFailure error={report.error} /> : null}

      <form
        className="page__card incident-form"
        aria-label="Report incident"
        noValidate
        onSubmit={submit}
        data-testid="report-incident-form"
      >
        <Field label="Summary" required error={errors.summary} wide>
          <input
            value={form.summary}
            onChange={(e) => set('summary', e.currentTarget.value)}
            placeholder="Checkout returns 500 for card payments"
            aria-required="true"
          />
        </Field>
        <Field label="Service">
          <input value={form.service} onChange={(e) => set('service', e.currentTarget.value)} placeholder="checkout" />
        </Field>
        <Field label="Severity">
          <select value={form.severity} onChange={(e) => set('severity', e.currentTarget.value)}>
            <option value="">Not sure yet</option>
            {SEVERITIES.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Repository" error={errors.repo}>
          <input value={form.repo} onChange={(e) => set('repo', e.currentTarget.value)} placeholder="owner/name" />
        </Field>
        <Field label="Detected at" error={errors.detectedAt}>
          <input type="datetime-local" value={form.detectedAt} onChange={(e) => set('detectedAt', e.currentTarget.value)} />
        </Field>
        <Field label="Changes that caused it" error={errors.changes} wide>
          <textarea
            rows={3}
            value={form.changes}
            onChange={(e) => set('changes', e.currentTarget.value)}
            placeholder="One change key per line"
          />
        </Field>
        <Field label="Restored at" error={errors.restoredAt}>
          <input type="datetime-local" value={form.restoredAt} onChange={(e) => set('restoredAt', e.currentTarget.value)} />
        </Field>
        <Field label="Restoring change">
          <input value={form.restoringChange} onChange={(e) => set('restoringChange', e.currentTarget.value)} />
        </Field>
        <label className="incident-form__field incident-form__field--wide">
          <span>
            <input type="checkbox" checked={form.closed} onChange={(e) => set('closed', e.currentTarget.checked)} /> Close
            it now
          </span>
        </label>
        <div className="page__inline-actions incident-form__actions">
          <ActionButton type="submit" variant="primary" disabled={report.isPending}>
            {report.isPending ? 'Reporting…' : 'Report incident'}
          </ActionButton>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  required,
  error,
  wide,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string | undefined;
  wide?: boolean;
  children: JSX.Element;
}): JSX.Element {
  return (
    <label className={wide ? 'incident-form__field incident-form__field--wide' : 'incident-form__field'}>
      <span>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </span>
      {children}
      {error ? (
        <span className="incident-form__error" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}

function SubmitFailure({ error }: { error: ApiError }): JSX.Element {
  if (isPipelineUnavailable(error)) {
    return (
      <EmptyState
        icon={ServerOff}
        title="Not available on this server version."
        description="This server cannot take incident reports yet. It appears once the forge is released with the incidents API."
      />
    );
  }
  if (isPipelineForbidden(error)) {
    return (
      <PermissionDeniedState
        title="You are not allowed to report incidents."
        description="Reporting needs a global admin or a login listed in JERYU_EVENT_REPORTERS."
      />
    );
  }
  return (
    <p className="incident-form__error" role="alert" data-testid="report-incident-error">
      Could not report the incident: {error.message}
    </p>
  );
}
