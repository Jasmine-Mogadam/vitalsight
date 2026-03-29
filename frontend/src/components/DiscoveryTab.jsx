import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function DiscoveryTab() {
  const [filters, setFilters] = useState({ search: '', type: '', reward_type: '' });
  const [trials, setTrials] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api('/api/trials')
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

  const loadTrials = async (nextFilters = filters) => {
    const params = new URLSearchParams();
    Object.entries(nextFilters).forEach(([key, value]) => value && params.set(key, value));
    const query = params.toString();
    const result = await api(`/api/trials${query ? `?${query}` : ''}`);
    setTrials(result.trials || []);
  };

  const requestJoin = async (trialId) => {
    try {
      await api(`/api/trials/${trialId}/join`, { method: 'POST' });
      await loadTrials();
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
          <select value={filters.reward_type} onChange={(e) => setFilters({ ...filters, reward_type: e.target.value })}>
            <option value="">Any reward</option>
            <option value="money">Money</option>
            <option value="volunteer_hours">Volunteer hours</option>
            <option value="none">No reward</option>
          </select>
          <button className="secondary-btn" type="button" onClick={() => loadTrials(filters).catch((err) => setError(err.message))}>Apply</button>
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="stack-list">
          {trials.map((trial) => (
            <div className="list-card" key={trial.id}>
              <div>
                <h3>{trial.name}</h3>
                <p className="muted-text">{trial.description || 'No description yet.'}</p>
                <p className="muted-text">Type: {trial.type || 'General'} • Reward: {trial.reward_type || 'none'}</p>
              </div>
              <button className="primary-btn" type="button" onClick={() => requestJoin(trial.id)}>Request join</button>
            </div>
          ))}
          {!trials.length && <div className="empty-state">No trials matched your current filters.</div>}
        </div>
      </section>
    </div>
  );
}
