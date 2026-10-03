// FamilyScopeChip.tsx — the family scope, in the shell header.
//
// It is on every page, because the scope is: "Family: acme ×" says what the
// left nav, the `g x` shortcuts and the palette are carrying, the select
// changes it, and the × shows every family again. The palette's "Switch
// family…" opens the select from the keyboard (see useShellCommands).

import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { useShiftFamilies } from '../../hooks/useShift';
import { familyLabel } from '../../pages/pullRoomModel';
import { canonicalFamily } from './familyScope';
import { useFamilyScope } from './FamilyScopeProvider';

import './FamilyScopeChip.css';

/** Every family a reader can choose, canonical and in one order. */
function familyOptions(names: readonly string[], scope: string): string[] {
  const keys = new Set<string>();
  for (const name of names) {
    const key = canonicalFamily(name);
    if (key) keys.add(key);
  }
  // The scope is always choosable, even when the families call did not answer.
  if (scope) keys.add(scope);
  return [...keys].sort((a, b) => a.localeCompare(b));
}

export function FamilyScopeChip(): JSX.Element {
  const scope = useFamilyScope();
  const families = useShiftFamilies();
  const select = useRef<HTMLSelectElement | null>(null);
  const options = familyOptions(
    families.data?.families.map((family) => family.name) ?? [],
    scope.family
  );

  // "Switch family…" in the palette is this control, reached from the keyboard.
  useEffect(() => {
    if (!scope.pickerOpen) return;
    select.current?.focus();
    scope.setPickerOpen(false);
  }, [scope]);

  return (
    <div
      className={`family-scope${scope.active ? ' family-scope--active' : ''}`}
      data-testid="family-scope"
      data-family={scope.family}
    >
      <label className="family-scope__label" htmlFor="family-scope-select">
        Family:
      </label>
      <select
        id="family-scope-select"
        ref={select}
        className="family-scope__select"
        data-testid="family-scope-select"
        value={scope.family}
        onChange={(event) => scope.setFamily(event.target.value)}
      >
        <option value="">All families</option>
        {options.map((key) => (
          <option key={key} value={key}>
            {familyLabel(key)}
          </option>
        ))}
      </select>
      {scope.active ? (
        <button
          type="button"
          className="family-scope__clear"
          data-testid="family-scope-clear"
          title="Show all families"
          aria-label={`Showing only ${scope.label}: show all families`}
          onClick={() => scope.clearFamily()}
        >
          <X size={12} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
