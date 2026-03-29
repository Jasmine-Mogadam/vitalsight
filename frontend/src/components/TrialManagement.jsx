import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import InfoTip from './InfoTip';
import Toast from './Toast';
import {
  COMPENSATION_OPTIONS,
  PAYMENT_STRUCTURE_OPTIONS,
  getTrialSearchPreview,
} from '../lib/trialCompensation';

export default function TrialManagement() {
  const { id } = useParams();
  const [trial, setTrial] = useState(null);
  const [enrollments, setEnrollments] = useState([]);
  const [invites, setInvites] = useState([]);
  const [form, setForm] = useState({});
  const [inviteForm, setInviteForm] = useState({ uses_remaining: 1, prefillName: '', prefillEmail: '' });
  const [error, setError] = useState('');
  const [toastMessage, setToastMessage] = useState('');

  useEffect(() => {
    let active = true;
    api(`/api/trials/${id}`)
      .then((result) => {
        if (!active) return;
        setTrial(result.trial);
        setEnrollments(result.enrollments || []);
        setInvites(result.invites || []);
        setForm(result.trial);
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [id]);

  const load = async () => {
    const result = await api(`/api/trials/${id}`);
    setTrial(result.trial);
    setEnrollments(result.enrollments || []);
    setInvites(result.invites || []);
    setForm(result.trial);
  };

  const saveTrial = async (event) => {
    event.preventDefault();
    try {
      const result = await api(`/api/trials/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(form),
      });
      setTrial(result.trial);
      setForm(result.trial);
      setToastMessage('Trial changes saved.');
    } catch (err) {
      setError(err.message);
    }
  };

  const updateEnrollment = async (enrollmentId, status) => {
    try {
      await api(`/api/trials/enrollments/${enrollmentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const createInvite = async (event) => {
    event.preventDefault();
    try {
      await api(`/api/trials/${id}/invites`, {
        method: 'POST',
        body: JSON.stringify({
          uses_remaining: inviteForm.uses_remaining ? Number(inviteForm.uses_remaining) : null,
          prefill_data: inviteForm.prefillName || inviteForm.prefillEmail
            ? { name: inviteForm.prefillName, email: inviteForm.prefillEmail }
            : null,
        }),
      });
      setInviteForm({ uses_remaining: 1, prefillName: '', prefillEmail: '' });
      await load();
      setToastMessage('Invite link created.');
    } catch (err) {
      setError(err.message);
    }
  };

  const copyInviteLink = async (token) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/join/${token}`);
      setToastMessage('Invite link copied.');
    } catch (err) {
      setError(err.message);
    }
  };

  if (!trial) {
    return <div className="page-shell"><div className="empty-state">Loading trial...</div></div>;
  }

  const preview = getTrialSearchPreview(form);

  return (
    <div className="page-shell">
      <section className="panel-grid two-up">
        <article className="panel">
          <p className="eyebrow">Trial management</p>
          <h1>{trial.name}</h1>
          <form className="stack-form" onSubmit={saveTrial}>
            <label>
              Name
              <input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label>
              Type
              <input value={form.type || ''} onChange={(e) => setForm({ ...form, type: e.target.value })} />
            </label>
            <label>
              Description
              <textarea value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <label>
              Trial start date
              <input type="date" value={form.start_date || ''} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </label>
            <label>
              Applications close
              <input type="date" value={form.applications_close_at || ''} onChange={(e) => setForm({ ...form, applications_close_at: e.target.value })} />
            </label>
            <label>
              Status
              <select value={form.status || 'active'} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="closed">Closed</option>
              </select>
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={Boolean(form.is_private)} onChange={(e) => setForm({ ...form, is_private: e.target.checked })} />
              Private invite-only trial
            </label>
            <label>
              <span className="field-title-with-tip">
                Compensation
                <InfoTip
                  label="Compensation help"
                  content="Choose whether this trial offers reimbursements, stipends, incentives, or no compensation."
                />
              </span>
              <select
                value={form.compensation_type || 'none'}
                onChange={(e) => setForm({
                  ...form,
                  compensation_type: e.target.value,
                  payment_structure: e.target.value === 'none' ? null : form.payment_structure,
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
            {(form.compensation_type || 'none') !== 'none' && (
              <label>
                <span className="field-title-with-tip">
                  Payment structure
                  <InfoTip
                    label="Payment structure help"
                    content="Choose whether compensation is paid once at the end or across milestones and visits."
                  />
                </span>
                <select
                  value={form.payment_structure || ''}
                  onChange={(e) => setForm({ ...form, payment_structure: e.target.value })}
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
                value={form.compensation_details || ''}
                onChange={(e) => setForm({ ...form, compensation_details: e.target.value })}
                placeholder="Examples: reimbursed parking, $75 stipend per visit, completion bonus"
              />
            </label>
            <div className="preview-card">
              <p className="eyebrow">Search preview</p>
              <div className="list-card tall search-preview-card">
                <div className="search-preview-body">
                  <h3>{form.name || 'Untitled trial'}</h3>
                  <p className="muted-text">{form.description || 'Your description will appear here in trial discovery.'}</p>
                  <div className="search-preview-meta">
                    <p className="muted-text">Type: {preview.type}</p>
                    <p className="muted-text">{preview.compensationLine}</p>
                  </div>
                  <div className="tag-row">
                    {preview.tags.map((tag) => (
                      <span className="tag-chip" key={tag}>{tag}</span>
                    ))}
                    {form.is_private && <span className="tag-chip subtle">Private</span>}
                  </div>
                </div>
              </div>
            </div>
            {error && <p className="error-text">{error}</p>}
            <button className="primary-btn" type="submit">Save changes</button>
            <Link className="secondary-btn" to={`/trials/${trial.id}/forms`}>Manage forms</Link>
          </form>
        </article>

        <article className="panel">
          <p className="eyebrow">Participants</p>
          <h2>Enrollment queue</h2>
          <div className="stack-list">
            {enrollments.map((enrollment) => (
              <div className="list-card tall" key={enrollment.id}>
                <div>
                  <h3>{enrollment.patient_name}</h3>
                  <p className="muted-text">{enrollment.patient_email}</p>
                  <p className="status-row">Status: <span className={`status-chip ${enrollment.status}`}>{enrollment.status}</span></p>
                </div>
                <div className="action-row">
                  <button className="primary-btn" type="button" onClick={() => updateEnrollment(enrollment.id, 'approved')}>Approve</button>
                  <button className="secondary-btn" type="button" onClick={() => updateEnrollment(enrollment.id, 'rejected')}>Reject</button>
                </div>
              </div>
            ))}
            {!enrollments.length && <div className="empty-state">No enrollments yet.</div>}
          </div>
        </article>
      </section>

      <section className="panel-grid two-up">
        <article className="panel">
          <p className="eyebrow">Invite links</p>
          <h2>Create a private invite</h2>
          <form className="stack-form" onSubmit={createInvite}>
            <label>
              Uses remaining
              <input type="number" value={inviteForm.uses_remaining} onChange={(e) => setInviteForm({ ...inviteForm, uses_remaining: e.target.value })} />
            </label>
            <label>
              Prefill name
              <input value={inviteForm.prefillName} onChange={(e) => setInviteForm({ ...inviteForm, prefillName: e.target.value })} />
            </label>
            <label>
              Prefill email
              <input value={inviteForm.prefillEmail} onChange={(e) => setInviteForm({ ...inviteForm, prefillEmail: e.target.value })} />
            </label>
            <button className="primary-btn" type="submit">Generate invite</button>
          </form>
        </article>

        <article className="panel">
          <p className="eyebrow">Active links</p>
          <h2>Share these URLs</h2>
          <div className="stack-list">
            {invites.map((invite) => (
              <div className="list-card tall invite-pill-card" key={invite.id}>
                <button className="secondary-btn invite-copy-btn" type="button" onClick={() => copyInviteLink(invite.token)}>
                  Copy
                </button>
                <div className="invite-pill-content">
                  <h3 className="truncate-text">{invite.prefill_data?.name || `/join/${invite.token}`}</h3>
                  <p className="muted-text truncate-text">{`${window.location.origin}/join/${invite.token}`}</p>
                  {invite.prefill_data?.email && <p className="muted-text">{invite.prefill_data.email}</p>}
                  <p className="muted-text">Uses remaining: {invite.uses_remaining ?? 'unlimited'}</p>
                </div>
              </div>
            ))}
            {!invites.length && <div className="empty-state">No invite links yet.</div>}
          </div>
        </article>
      </section>
      <Toast message={toastMessage} onClose={() => setToastMessage('')} />
    </div>
  );
}
