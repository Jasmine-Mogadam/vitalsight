import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/useAuth';
import { api } from '../lib/api';
import InfoTip from './InfoTip';
import {
  COMPENSATION_OPTIONS,
  PAYMENT_STRUCTURE_OPTIONS,
  getTrialSearchPreview,
} from '../lib/trialCompensation';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState({ trials: [], enrollments: [], formsByTrial: {} });
  const [newTrial, setNewTrial] = useState({
    name: '',
    type: '',
    description: '',
    start_date: '',
    applications_close_at: '',
    is_private: true,
    compensation_type: 'none',
    payment_structure: '',
    compensation_details: '',
  });
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
          payment_structure: newTrial.compensation_type === 'none' ? null : (newTrial.payment_structure || null),
        }),
      });
      navigate(`/trials/${result.trial.id}`);
    } catch (err) {
      setError(err.message);
    }
  };

  if (user.role === 'coordinator') {
    const preview = getTrialSearchPreview(newTrial);

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
            <h2>Create a study</h2>
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
              <label>
                Trial start date
                <input type="date" value={newTrial.start_date} onChange={(e) => setNewTrial({ ...newTrial, start_date: e.target.value })} />
              </label>
              <label>
                Applications close
                <input type="date" value={newTrial.applications_close_at} onChange={(e) => setNewTrial({ ...newTrial, applications_close_at: e.target.value })} />
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={Boolean(newTrial.is_private)}
                  onChange={(e) => setNewTrial({ ...newTrial, is_private: e.target.checked })}
                />
                Private invite-only trial
              </label>
              <label>
                <span className="field-title-with-tip">
                  Compensation
                  <InfoTip
                    label="Compensation help"
                    content="Choose the main compensation style participants should expect, such as reimbursements, stipends, incentives, or none."
                  />
                </span>
                <select
                  value={newTrial.compensation_type}
                  onChange={(e) => setNewTrial({
                    ...newTrial,
                    compensation_type: e.target.value,
                    payment_structure: e.target.value === 'none' ? '' : newTrial.payment_structure,
                  })}
                >
                  {COMPENSATION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <div className="inline-option-list">
                  {COMPENSATION_OPTIONS.map((option) => (
                    <span className="inline-option-hint" key={option.value}>
                      {option.label}
                      <InfoTip label={`${option.label} help`} content={option.help} />
                    </span>
                  ))}
                </div>
              </label>
              {newTrial.compensation_type !== 'none' && (
                <label>
                  <span className="field-title-with-tip">
                    Payment structure
                    <InfoTip
                      label="Payment structure help"
                      content="Explain whether participants are paid once at the end or in steps across visits and milestones."
                    />
                  </span>
                  <select
                    value={newTrial.payment_structure}
                    onChange={(e) => setNewTrial({ ...newTrial, payment_structure: e.target.value })}
                    required
                  >
                    <option value="">Select a structure</option>
                    {PAYMENT_STRUCTURE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <div className="inline-option-list">
                    {PAYMENT_STRUCTURE_OPTIONS.map((option) => (
                      <span className="inline-option-hint" key={option.value}>
                        {option.label}
                        <InfoTip label={`${option.label} help`} content={option.help} />
                      </span>
                    ))}
                  </div>
                </label>
              )}
              <label>
                Compensation details
                <textarea
                  value={newTrial.compensation_details}
                  onChange={(e) => setNewTrial({ ...newTrial, compensation_details: e.target.value })}
                  placeholder="Examples: travel reimbursement, $50 per visit, gift card after completion"
                />
              </label>
              {error && <p className="error-text">{error}</p>}
              <div className="preview-card">
                <p className="eyebrow">Search preview</p>
                <div className="list-card tall search-preview-card">
                  <div>
                    <h3>{newTrial.name || 'Untitled trial'}</h3>
                    <p className="muted-text">{newTrial.description || 'Your description will appear here in trial discovery.'}</p>
                    <p className="muted-text">Type: {preview.type}</p>
                    <p className="muted-text">{preview.compensationLine}</p>
                    <div className="tag-row">
                      {preview.tags.map((tag) => (
                        <span className="tag-chip" key={tag}>{tag}</span>
                      ))}
                      {newTrial.is_private && <span className="tag-chip subtle">Private</span>}
                    </div>
                  </div>
                </div>
              </div>
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
