export default function SessionRecoveryDialog({
  email,
  password,
  error,
  submitting,
  onChange,
  onDismiss,
  onSubmit,
}) {
  return (
    <div className="modal-backdrop session-modal-backdrop" role="presentation">
      <div className="modal-card session-modal-card" role="dialog" aria-modal="true" aria-labelledby="session-recovery-title">
        <p className="eyebrow">Session paused</p>
        <h2 id="session-recovery-title">Sign back in to keep your work</h2>
        <p className="muted-text">
          Your login expired while you were working. Reconnect here and we&apos;ll keep you on this page.
        </p>
        <form className="stack-form compact-form" onSubmit={onSubmit}>
          <label>
            Email
            <input
              autoComplete="email"
              type="email"
              value={email}
              onChange={(event) => onChange('email', event.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => onChange('password', event.target.value)}
              required
            />
          </label>
          {error && <p className="error-text">{error}</p>}
          <div className="action-row">
            <button className="primary-btn" type="submit" disabled={submitting}>
              {submitting ? 'Reconnecting...' : 'Continue session'}
            </button>
            <button className="secondary-btn" type="button" onClick={onDismiss} disabled={submitting}>
              Not now
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
