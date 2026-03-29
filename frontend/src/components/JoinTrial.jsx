import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/useAuth';
import { api } from '../lib/api';

export default function JoinTrial() {
  const { token } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/api/trials/join/${token}`)
      .then((result) => setPayload(result))
      .catch((err) => setError(err.message));
  }, [token]);

  const enroll = async () => {
    try {
      await api(`/api/trials/join/${token}/enroll`, { method: 'POST' });
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    }
  };

  if (error) {
    return <div className="page-shell"><div className="empty-state">{error}</div></div>;
  }

  if (!payload) {
    return <div className="page-shell"><div className="empty-state">Validating invite...</div></div>;
  }

  return (
    <div className="page-shell">
      <section className="panel">
        <p className="eyebrow">Private trial invite</p>
        <h1>{payload.trial.name}</h1>
        <p className="muted-text">{payload.trial.description || 'No description yet.'}</p>
        {payload.invite.prefill_data && (
          <p className="muted-text">Prefilled for {payload.invite.prefill_data.name || payload.invite.prefill_data.email}</p>
        )}
        {user ? (
          <button className="primary-btn" type="button" onClick={enroll}>Join trial</button>
        ) : (
          <p className="muted-text">Please <Link to="/login">log in</Link> or <Link to="/register">register</Link> first, then reopen this invite.</p>
        )}
      </section>
    </div>
  );
}
