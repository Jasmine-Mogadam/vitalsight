import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../contexts/useAuth';
import Toast from './Toast';
import {
  COMPENSATION_OPTIONS,
  getTrialSearchPreview,
  getTrialTimingSummary,
} from '../lib/trialCompensation';

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'start_date', label: 'Trial start date' },
  { value: 'ongoing', label: 'Ongoing applications' },
  { value: 'applications_close', label: 'Application close date' },
];

function truncateDescription(description, maxLength = 220) {
  if (!description) return { text: 'No description yet.', truncated: false };
  if (description.length <= maxLength) return { text: description, truncated: false };
  return {
    text: `${description.slice(0, maxLength).trimEnd()}...`,
    truncated: true,
  };
}

export default function DiscoveryTab() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ search: '', type: '', compensation_type: '', sort: 'ongoing' });
  const [trials, setTrials] = useState([]);
  const [error, setError] = useState('');
  const [toastMessage, setToastMessage] = useState(() => location.state?.toastMessage || '');

  useEffect(() => {
    let active = true;
    api('/api/trials?sort=ongoing')
      .then((result) => {
        if (active) setTrials(result.trials || []);
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const message = location.state?.toastMessage;
    if (!message) return;
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.pathname, location.state, navigate]);

  const loadTrials = async (nextFilters = filters) => {
    const params = new URLSearchParams();
    Object.entries(nextFilters).forEach(([key, value]) => value && params.set(key, value));
    const query = params.toString();
    const result = await api(`/api/trials${query ? `?${query}` : ''}`);
    setTrials(result.trials || []);
  };

  const requestJoin = async (trialId) => {
    if (!user) {
      navigate('/login');
      return;
    }
    try {
      await api(`/api/trials/${trialId}/join`, { method: 'POST' });
      await loadTrials();
      setToastMessage('Application submitted successfully. Your request is pending review.');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="page-shell">
      <section className="panel">
        <p className="eyebrow">Discover trials</p>
        <h1>Search open public studies</h1>
        <div className="filter-row">
          <input placeholder="Search" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
          <input placeholder="Type" value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })} />
          <select value={filters.compensation_type} onChange={(e) => setFilters({ ...filters, compensation_type: e.target.value })}>
            <option value="">Any compensation</option>
            {COMPENSATION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <select value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value })}>
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <button className="secondary-btn" type="button" onClick={() => loadTrials(filters).catch((err) => setError(err.message))}>Apply</button>
        </div>
        {!user && <p className="muted-text">Browse freely. Log in as a patient to request access to a trial.</p>}
        {error && <p className="error-text">{error}</p>}
        <div className="stack-list">
          {trials.map((trial) => {
            const preview = getTrialSearchPreview(trial);
            const timing = getTrialTimingSummary(trial);
            const description = truncateDescription(trial.description);
            return (
              <div className="list-card tall search-result-card" key={trial.id}>
                <div className="search-result-content search-result-body">
                  <h3>{trial.name}</h3>
                  <div className="search-result-copy">
                    <p className="muted-text">{description.text}</p>
                    {description.truncated && <Link className="see-more-link" to={`/discover/${trial.id}`}>... See More</Link>}
                  </div>
                  <div className="search-result-meta">
                    <p className="muted-text">Type: {preview.type}</p>
                    <p className="muted-text">{preview.compensationLine}</p>
                    {timing.map((line) => (
                      <p className="muted-text" key={line}>{line}</p>
                    ))}
                  </div>
                  <div className="tag-row">
                    {preview.tags.map((tag) => (
                      <span className="tag-chip" key={tag}>{tag}</span>
                    ))}
                    <span className="tag-chip subtle">{trial.applications_open ? 'Open now' : 'Applications closed'}</span>
                  </div>
                </div>
                <div className="action-row search-result-actions">
                  <Link className="secondary-btn" to={`/discover/${trial.id}`}>View trial</Link>
                  <button className="primary-btn" type="button" onClick={() => requestJoin(trial.id)} disabled={user && !trial.applications_open}>
                    {!trial.applications_open ? 'Applications closed' : user ? 'Request join' : 'Log in to join'}
                  </button>
                </div>
              </div>
            );
          })}
          {!trials.length && <div className="empty-state">No trials matched your current filters.</div>}
        </div>
      </section>
      <Toast message={toastMessage} onClose={() => setToastMessage('')} />
    </div>
  );
}
