import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../contexts/useAuth';
import { getTrialSearchPreview, getTrialTimingSummary } from '../lib/trialCompensation';

export default function TrialDetails() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [trial, setTrial] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/api/trials/public/${id}`)
      .then((result) => setTrial(result.trial))
      .catch((err) => setError(err.message));
  }, [id]);

  const requestJoin = async () => {
    if (!user) {
      navigate('/login');
      return;
    }
    try {
      await api(`/api/trials/${id}/join`, { method: 'POST' });
      navigate('/discover', {
        state: {
          toastMessage: 'Application submitted successfully. Your request is pending review.',
        },
      });
    } catch (err) {
      setError(err.message);
    }
  };

  if (error) {
    return <div className="page-shell"><div className="empty-state">{error}</div></div>;
  }

  if (!trial) {
    return <div className="page-shell"><div className="empty-state">Loading trial...</div></div>;
  }

  const preview = getTrialSearchPreview(trial);
  const timing = getTrialTimingSummary(trial);

  return (
    <div className="page-shell">
      <section className="panel detail-page">
        <div className="action-row">
          <Link className="secondary-btn" to="/discover">Back to discover</Link>
          <button className="primary-btn" type="button" onClick={requestJoin} disabled={user && !trial.applications_open}>
            {!trial.applications_open ? 'Applications closed' : user ? 'Request join' : 'Log in to join'}
          </button>
        </div>
        <p className="eyebrow">Trial details</p>
        <h1>{trial.name}</h1>
        <div className="tag-row">
          {preview.tags.map((tag) => (
            <span className="tag-chip" key={tag}>{tag}</span>
          ))}
          <span className="tag-chip subtle">{trial.applications_open ? 'Applications open' : 'Applications closed'}</span>
        </div>
        <p>{trial.description || 'No description yet.'}</p>
        <p className="muted-text">Type: {preview.type}</p>
        <p className="muted-text">{preview.compensationLine}</p>
        {trial.compensation_details && <p className="muted-text">Details: {trial.compensation_details}</p>}
        {timing.map((line) => (
          <p className="muted-text" key={line}>{line}</p>
        ))}
      </section>
    </div>
  );
}
