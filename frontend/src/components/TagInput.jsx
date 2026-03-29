import { useState } from 'react';

export default function TagInput({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
  helperText,
  normalizeValue,
}) {
  const [draft, setDraft] = useState('');

  const addTag = (rawValue) => {
    const nextValue = typeof normalizeValue === 'function' ? normalizeValue(rawValue) : rawValue.trim();
    if (!nextValue) return;
    if (value.includes(nextValue)) {
      setDraft('');
      return;
    }
    onChange([...value, nextValue]);
    setDraft('');
  };

  const removeTag = (tag) => {
    onChange(value.filter((item) => item !== tag));
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addTag(draft);
    }
    if (event.key === 'Backspace' && !draft && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <label>
      {label}
      <div className="tag-input-shell">
        <div className="tag-list">
          {value.map((tag) => (
            <span className="tag-chip" key={tag}>
              {tag}
              <button type="button" className="tag-chip-remove" onClick={() => removeTag(tag)} aria-label={`Remove ${tag}`}>
                ×
              </button>
            </span>
          ))}
          <input
            className="tag-input-field"
            value={draft}
            inputMode={inputMode}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => addTag(draft)}
            placeholder={placeholder}
          />
        </div>
      </div>
      {helperText ? <span className="field-helper">{helperText}</span> : null}
    </label>
  );
}
