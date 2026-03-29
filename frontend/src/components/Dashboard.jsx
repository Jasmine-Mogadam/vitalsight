import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/useAuth';
import { api } from '../lib/api';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState({ trials: [], enrollments: [], formsByTrial: {} });
  const [newTrial, setNewTrial] = useState({ name: '', type: '', description: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        if (user.role === 'coordinator') {
          const result = await api('/api/trials/mine');
          if (active) setData((current) => ({ ...current, trials: result.trials || [] }));
          return;
        }

        const result = await api('/api/trials/mine');
        const approved = (result.enrollments || []).filter((item) => item.status === 'approved');
        const formsEntries = await Promise.all(
          approved.map(async (enrollment) => {
            const forms = await api(`/api/forms/trial/${enrollment.trial_id}`);
            return [enrollment.trial_id, forms.forms || []];
          })
        );

        if (active) {
          setData({
            enrollments: result.enrollments || [],
            trials: [],
            formsByTrial: Object.fromEntries(formsEntries),
          });
        }
      } catch (err) {
        if (active) setError(err.message);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [user]);

  const createTrial = async (event) => {
    event.preventDefault();
    try {
      const result = await api('/api/trials', {
        method: 'POST',
        body: JSON.stringify({
          ...newTrial,
          reward_type: 'none',
          is_private: 0,
        }),
      });
      navigate(`/trials/${result.trial.id}`);
    } catch (err) {
      setError(err.message);
    }
  };

  if (user.role === 'coordinator') {
    return (
      <div className="page-shell">
        <section className="panel-grid two-up">
          <article className="panel">
            <p className="eyebrow">Coordinator workspace</p>
            <h1>Your trials</h1>
            <div className="stack-list">
              {data.trials.map((trial) => (
                <div className="list-card" key={trial.id}>
                  <div>
                    <h3>{trial.name}</h3>
                    <p className="muted-text">{trial.type || 'General'} • {trial.approved_count} approved • {trial.pending_requests} pending</p>
                  </div>
                  <Link className="secondary-btn" to={`/trials/${trial.id}`}>Manage</Link>
                </div>
              ))}
              {!data.trials.length && <div className="empty-state">No trials yet. Create your first study below.</div>}
            </div>
          </article>

          <article className="panel">
            <p className="eyebrow">New trial</p>
            <h2>Create a public study</h2>
            <form className="stack-form" onSubmit={createTrial}>
              <label>
                Trial name
                <input value={newTrial.name} onChange={(e) => setNewTrial({ ...newTrial, name: e.target.value })} required />
              </label>
              <label>
                Type
                <input value={newTrial.type} onChange={(e) => setNewTrial({ ...newTrial, type: e.target.value })} />
              </label>
              <label>
                Description
                <textarea value={newTrial.description} onChange={(e) => setNewTrial({ ...newTrial, description: e.target.value })} />
              </label>
              {error && <p className="error-text">{error}</p>}
              <button className="primary-btn" type="submit">Create trial</button>
            </form>
          </article>
        </section>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <section className="panel">
        <p className="eyebrow">Patient dashboard</p>
        <h1>Your trials and forms</h1>
        {error && <p className="error-text">{error}</p>}
        <div className="stack-list">
          {data.enrollments.map((enrollment) => (
            <div className="list-card tall" key={enrollment.id}>
              <div>
                <h3>{enrollment.name}</h3>
                <p className="muted-text">{enrollment.description || 'No description yet.'}</p>
                <p className="status-row">Status: <span className={`status-chip ${enrollment.status}`}>{enrollment.status}</span></p>
                {enrollment.status === 'approved' && (
                  <div className="inline-links">
                    {(data.formsByTrial[enrollment.trial_id] || []).map((form) => (
                      <Link key={form.id} className="pill-link" to={`/forms/${form.id}/fill`}>{form.title}</Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {!data.enrollments.length && (
            <div className="empty-state">
              You are not enrolled in any trials yet. Visit <Link to="/discover">Discover</Link> to request access.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
