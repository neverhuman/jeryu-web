import './LandingSections.css';

const stages = [
  ['01', 'Issue', 'Give the work a clear starting point.'],
  ['02', 'Agent session', 'Keep the context with the code.'],
  ['03', 'Evidence', 'Make the result inspectable.'],
  ['04', 'Pull request', 'Bring the change into review.'],
  ['05', 'Gated merge', 'Let the checks speak first.'],
] as const;

export function LandingSections(): JSX.Element {
  return (
    <div className="landing-sections">
      <section id="how-it-works" className="landing-workflow" aria-labelledby="workflow-title">
        <div className="landing-workflow__intro">
          <div>
            <p className="landing-section-label">The way forward</p>
            <h2 id="workflow-title">From intent<br />to evidence.</h2>
          </div>
          <p>Agent work deserves a place to land. Follow the context, inspect the result,
            and review the change with its history intact.</p>
        </div>
        <ol className="landing-workflow__stages">
          {stages.map(([number, title, description]) => (
            <li key={number}>
              <span className="landing-workflow__number" aria-hidden="true">{number}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </li>
          ))}
        </ol>
      </section>
      <section className="landing-detail" aria-labelledby="detail-title">
        <div className="landing-detail__drawing" aria-hidden="true">
          <svg viewBox="0 0 540 280" fill="none" focusable="false">
            <path d="M50 140H480M140 140C175 140 175 62 210 62H330C365 62 365 140 400 140M140 140C175 140 175 218 210 218H330C365 218 365 140 400 140" stroke="currentColor" strokeWidth="1.5" />
            <path d="M200 140H355M242 62H300M242 218H300" stroke="currentColor" strokeWidth="5" opacity=".15" />
            {[70, 140, 400, 470].map((x) => <circle key={x} cx={x} cy="140" r="8" fill="var(--color-bg-0)" stroke="currentColor" strokeWidth="2" />)}
            {[240, 300].map((x) => <circle key={`top-${x}`} cx={x} cy="62" r="7" fill="var(--color-bg-0)" stroke="var(--color-accent-primary)" strokeWidth="2" />)}
            {[240, 300].map((x) => <circle key={`bottom-${x}`} cx={x} cy="218" r="7" fill="var(--color-bg-0)" stroke="var(--color-accent-primary)" strokeWidth="2" />)}
            <circle cx="400" cy="140" r="22" stroke="var(--color-accent-primary)" opacity=".5" />
          </svg>
          <span>Independent work. Shared history.</span>
        </div>
        <div className="landing-detail__copy">
          <p className="landing-section-label">Built around the work</p>
          <h2 id="detail-title">Many agents.<br />One clear picture.</h2>
          <p>Keep repository families, agent sessions, and pull requests within reach.
            See what changed, what passed, and where your attention is needed.</p>
          <div className="landing-detail__facts">
            <p><span>01 /</span> Preserve the context.</p>
            <p><span>02 /</span> Review the evidence.</p>
            <p><span>03 /</span> Move the work forward.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
