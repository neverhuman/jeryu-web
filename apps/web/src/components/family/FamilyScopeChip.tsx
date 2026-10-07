// FamilyScopeChip.tsx — the family scope, in the shell header.
//
// It is on every page, because the scope is: "Family: acme ×" says what the
// left nav, the `g x` shortcuts and the palette are carrying, the select
// changes it, and the × shows every family again. The palette's "Switch
// family…" opens the select from the keyboard (see useShellCommands).
//
// On a page reached by a link into another family the chip says so — "outside
// acme" — and offers the one click that carries that other family instead.

import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { familyLabel } from '../../pages/pullRoomModel';
import { useFamilyScope } from './FamilyScopeProvider';
import { useFamilyNames } from './useFamilyNames';

import './FamilyScopeChip.css';

export function FamilyScopeChip(): JSX.Element {
  const scope = useFamilyScope();
  const select = useRef<HTMLSelectElement | null>(null);
  // The same list every other family control offers, so the header never
  // knows fewer families than the page under it.
  const { names: options } = useFamilyNames();

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
      data-family={scope.carried}
    >
      <label className="family-scope__label" htmlFor="family-scope-select">
        Family:
      </label>
      <select
        id="family-scope-select"
        ref={select}
        className="family-scope__select"
        data-testid="family-scope-select"
        value={scope.carried}
        onChange={(event) => scope.setFamily(event.target.value)}
      >
        {/* "All", not "All families": the chip is sized by its widest option,
            and the longer wording was cut to "All familie" in the header. */}
        <option value="">All</option>
        {options.map((key) => (
          <option key={key} value={key}>
            {familyLabel(key)}
          </option>
        ))}
      </select>
      {scope.outside ? (
        <button
          type="button"
          className="family-scope__outside"
          data-testid="family-scope-switch"
          title={`This page is outside ${scope.label || 'the scope'}`}
          onClick={() => scope.switchToOutside()}
        >
          outside {familyLabel(scope.carried)} · switch to {familyLabel(scope.outside)}
        </button>
      ) : null}
      {scope.carried ? (
        <button
          type="button"
          className="family-scope__clear"
          data-testid="family-scope-clear"
          title="Show all families"
          aria-label={`Showing only ${familyLabel(scope.carried)}: show all families`}
          onClick={() => scope.clearFamily()}
        >
          <X size={12} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
