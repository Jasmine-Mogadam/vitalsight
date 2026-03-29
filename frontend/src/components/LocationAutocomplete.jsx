import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

export default function LocationAutocomplete({ value, onChange }) {
  const [query, setQuery] = useState(value || '');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestRef = useRef(0);

  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  useEffect(() => {
    const nextQuery = query.trim();
    if (nextQuery.length < 2) {
      setResults([]);
      setLoading(false);
      return undefined;
    }

    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setLoading(true);
    setError('');

    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await api(`/api/locations/search?q=${encodeURIComponent(nextQuery)}`);
        if (requestRef.current !== requestId) return;
        setResults(Array.isArray(response.results) ? response.results : []);
      } catch (err) {
        if (requestRef.current !== requestId) return;
        setError(err.message || 'Unable to search locations');
        setResults([]);
      } finally {
        if (requestRef.current === requestId) {
          setLoading(false);
        }
      }
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [query]);

  const chooseLocation = (result) => {
    setQuery(result.value);
    onChange(result.value);
    setResults([]);
    setOpen(false);
  };

  return (
    <label className="location-field">
      Location
      <div className="autocomplete-shell">
        <input
          value={query}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => {
            const nextValue = event.target.value;
            setQuery(nextValue);
            onChange(nextValue);
          }}
          placeholder="Search city, state, or country"
          autoComplete="off"
        />
        {open && (loading || results.length > 0 || error) ? (
          <div className="autocomplete-menu">
            {loading ? <div className="autocomplete-item muted">Searching locations...</div> : null}
            {!loading && error ? <div className="autocomplete-item muted">{error}</div> : null}
            {!loading && !error && results.length === 0 ? <div className="autocomplete-item muted">No matching locations yet.</div> : null}
            {!loading && !error
              ? results.map((result) => (
                <button
                  type="button"
                  className="autocomplete-item"
                  key={result.id}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseLocation(result)}
                >
                  <span>{result.value}</span>
                  <small>{result.label}</small>
                </button>
              ))
              : null}
          </div>
        ) : null}
      </div>
      <span className="field-helper">Type at least two characters to search and autofill a location.</span>
    </label>
  );
}
