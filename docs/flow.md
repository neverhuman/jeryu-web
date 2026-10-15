# Flow

The delivery map shows implementation, parallel review/checks, the protected
merge decision, a fresh consumer PR for the Jeryu web pin, and release activation.
Repository lanes show their own recorded counts. Selecting a station filters its
current work and history by repository. A direct station URL without a repository
shows the family aggregate.

The selected station explains purpose, trigger, success, failure and deliberate
holds. Service links open the corresponding reporting runner pool. An execution
names a specific runner only when its evidence includes that identity; missing
identity remains explicit. Daily UTC bars count transitions (not unique work),
and clicking a segment filters the evidence list. Item journeys show recorded
transitions and verified release receipts, plus other changes in those releases.

The data contract and reconciliation policy are owned by jeryu-deploy:
`docs/flow.md` and ADR 0013. The history route is admin-only, paginated in batches
of 100 and preserves family/repository filtering. A missing history or layout
endpoint is an explicit unavailable state, not invented data. Historical hold
and execution coverage is labeled. Today is incomplete.

Proof: `52-flow.spec.ts` covers desktop/mobile rendering, keyboard navigation,
daily filtering, runner links, item inspection and accessibility. Unit tests
cover filtering requests and unsafe navigation. Production acceptance requires
the actual source PR, consumer PR, staged release and deployment receipt.


Current default-branch requirements are read from repository automation and branch
protection, including separately required jankurai proof. Zero required approvals
or checks are labeled pass-through **for that branch rule**; absent configuration
is unknown. Reporting actors are evidence of service presence, not proof that
human-only or automatic dispatch is configured. Repository-owned scripts can add
requirements not exposed by those APIs. The release diagram is specifically the
Jeryu web/deploy route; other routes remain unspecified. Serial legacy ETAs are
not displayed on the parallel delivery map.

## Next iteration: dispatch and segmentation

Record mechanical operations (rebase, re-gate, retry) separately from code repair,
and preserve mechanical/low/high/critical risk and the dispatch decision as
independent dimensions. Capture merge conflict detection/resolution, commit and
pull-request bucket membership, and grouping changes. These need producer events
with stable item/revision identities, timestamps, configuration revision, reason,
and runner/human ownership, not classification guessed from generic rework.

Use those dimensions to segment station inventory and daily activity by work
class, risk, dispatch, conflict status, and bucket, alongside repository, day,
state, item journey, and recorded runner. Measure retry recovery, conflict rate,
first-pass success, handoff delay, and regrouping with explicit denominators and
coverage. Count mechanical work without treating its frequency as code quality.
Expose effective repo-owned route configuration (pass-through, automatic,
human-only, mixed) and its revision before claiming these modes from the map.

Follow-up to the initial review: stations remain inspectable when release routing
is unknown; no consumer repository is fabricated from a source name. Missing
repository/station rows say no open visits are recorded, rather than displaying
hard zeros. Gate requirements include both configuration responses, so a stale
or missing branch-protection response cannot erase a reported required context.

### Closed work

Flow keeps closed, unmerged PRs and closed todos with no PR binding in a separate
closure list, outside active station counts. Merged work keeps its release steps.
The list exposes current descriptions, explicit replacement links and their
status, unknown dispositions, and recorded abandonment reasons. Filter it by
disposition or selected station; Inspect history opens the original event trail.
Older servers report lifecycle reconciliation unavailable. Existing history and
Scorecard metrics are not rewritten by the current lifecycle overlay.

Record `Superseded-by: owner/repo#123` on its own line in a PR description or todo
note, or both `Flow-disposition: abandoned` and `Flow-reason: ...` for a deliberate
cancellation. These are reported decisions, not proof of shipped commits. Without
those fields the explanation remains visible and the item needs disposition.
