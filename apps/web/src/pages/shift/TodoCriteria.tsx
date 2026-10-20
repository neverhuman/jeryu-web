import type { ShiftAcceptance } from '../../api/types';

/** The todo's acceptance checklist: each criterion with its evidence or unmet reason. */
export function TodoCriteria({ acceptance }: { acceptance: ShiftAcceptance }): JSX.Element | null {
  if (acceptance.state === 'unknown') return null;
  return (
    <section className="shift__section todo-criteria" aria-label="Acceptance criteria">
      <h2>Acceptance criteria</h2>
      {acceptance.items.length === 0 ? (
        <p>No acceptance criteria recorded for this todo.</p>
      ) : (
        <>
          <p>{acceptance.met} of {acceptance.total} met</p>
          <ul className="todo-criteria__list">
            {acceptance.items.map((item, index) => (
              <li key={index} data-checked={item.checked}>
                <span aria-hidden="true">{item.checked ? '☑' : '☐'}</span>{' '}
                <span>{item.text}</span>
                <span className="sr-only">{item.checked ? ' (met)' : ' (unmet)'}</span>
                {item.evidence ? (
                  <p className="todo-criteria__evidence">
                    {item.checked ? 'checked' : 'unmet'}: {item.evidence}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
