import { useEffect } from 'react';

export default function Toast({ message, onClose }) {
  useEffect(() => {
    if (!message) return undefined;
    const timeout = window.setTimeout(onClose, 2600);
    return () => window.clearTimeout(timeout);
  }, [message, onClose]);

  if (!message) return null;

  return (
    <div className="toast-shell" role="status" aria-live="polite">
      <div className="toast-card">
        <span>{message}</span>
        <button className="toast-close" type="button" onClick={onClose} aria-label="Dismiss notification">
          ×
        </button>
      </div>
    </div>
  );
}
