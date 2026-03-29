import { useState } from 'react';

export default function InfoTip({ label, content }) {
  const [open, setOpen] = useState(false);

  return (
    <span
      className={`info-tip ${open ? 'open' : ''}`}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        className="info-tip-trigger"
        type="button"
        aria-label={label}
        title={content}
        onClick={() => setOpen((current) => !current)}
      >
        ?
      </button>
      <span className="info-tip-bubble" role="tooltip">
        {content}
      </span>
    </span>
  );
}
