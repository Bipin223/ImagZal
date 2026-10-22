import { OUTPUT_FORMATS } from '../lib/formats';
import type { OutputFormat } from '../lib/formats';

interface FormatChipsProps {
  value: OutputFormat;
  onChange: (format: OutputFormat) => void;
  available: OutputFormat[];
  formats?: OutputFormat[];
  disabled?: boolean;
}

export function FormatChips({
  value,
  onChange,
  available,
  formats,
  disabled,
}: FormatChipsProps) {
  const shown = OUTPUT_FORMATS.filter((format) =>
    formats ? formats.includes(format.id) : true,
  );

  return (
    <div className="chips" role="radiogroup" aria-label="Output format">
      {shown.map((format) => {
        const enabled = available.includes(format.id);
        return (
          <button
            key={format.id}
            type="button"
            role="radio"
            aria-checked={value === format.id}
            disabled={disabled || !enabled}
            className={`chip${value === format.id ? ' is-active' : ''}`}
            title={
              enabled
                ? format.blurb
                : `${format.label} encoding is not available in this browser`
            }
            onClick={() => onChange(format.id)}
          >
            {format.label}
          </button>
        );
      })}
    </div>
  );
}
