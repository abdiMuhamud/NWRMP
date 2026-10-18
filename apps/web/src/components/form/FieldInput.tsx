import type { ReactNode } from 'react';
import type { FieldDef } from '../../lib/types';
import { Field, borderFor, inputClass } from '../ui/Controls';

interface FieldInputProps {
  def: FieldDef;
  value: string;
  onChange: (value: string) => void;
  /** Key used for the element id and error lookup, e.g. "status" or "details.depth_m" */
  name: string;
  error?: string;
  /** Options for region pickers */
  regions?: { id: number; name: string }[];
  /** Values offered while typing, overriding the definition's suggestions */
  suggestions?: string[];
  disabled?: boolean;
  /** Larger touch targets for phones */
  large?: boolean;
  className?: string;
}

/**
 * One form control rendered from a field definition. Values are strings (what inputs hold);
 * the API parses and validates them.
 */
export function FieldInput({ def, value, onChange, name, error, regions = [], suggestions, disabled, large, className = '' }: FieldInputProps) {
  const id = `f-${name}`;
  const describedBy = error ? `${id}-error` : def.help ? `${id}-hint` : undefined;
  const common = { id, disabled, 'aria-invalid': Boolean(error) || undefined, 'aria-describedby': describedBy };
  const label = def.unit ? `${def.label} (${def.unit})` : def.label;
  const cls = `${inputClass} ${borderFor(error)} ${large ? 'h-12 text-base' : ''}`;
  let control: ReactNode;

  switch (def.kind) {
    case 'select':
      control = (
        <select {...common} value={value} onChange={(e) => onChange(e.target.value)} className={cls}>
          {!def.required && <option value="">Not recorded</option>}
          {def.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
      break;
    case 'region':
      control = (
        <select {...common} value={value} onChange={(e) => onChange(e.target.value)} className={cls}>
          <option value="">Choose a region</option>
          {regions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      );
      break;
    case 'boolean':
      control = (
        <select {...common} value={value} onChange={(e) => onChange(e.target.value)} className={cls}>
          <option value="">Not recorded</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      );
      break;
    case 'textarea':
      control = <textarea {...common} rows={3} value={value} onChange={(e) => onChange(e.target.value)} className={`${cls} h-auto py-2`} />;
      break;
    default: {
      const options = suggestions ?? def.suggestions;
      const listId = options?.length ? `${id}-list` : undefined;
      control = (
        <>
          <input
            {...common}
            type={def.kind === 'date' ? 'date' : 'text'}
            inputMode={def.kind === 'number' ? 'decimal' : def.kind === 'integer' ? 'numeric' : undefined}
            list={listId}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={cls}
          />
          {listId && (
            <datalist id={listId}>
              {options?.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          )}
        </>
      );
    }
  }

  return (
    <Field label={label} htmlFor={id} required={def.required} error={error} hint={def.help} className={className}>
      {control}
    </Field>
  );
}
