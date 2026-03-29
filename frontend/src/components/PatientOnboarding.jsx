import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../contexts/useAuth';

export default function PatientOnboarding() {
  const { refreshUser } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    date_of_birth: '',
    age: '',
    ethnicity: '',
    location: '',
    conditions: '',
    trialIds: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api('/api/patients/profile', {
        method: 'PUT',
        body: JSON.stringify({
          date_of_birth: form.date_of_birth,
          age: form.age ? Number(form.age) : null,
          ethnicity: form.ethnicity,
          location: form.location,
          conditions: form.conditions.split(',').map((item) => item.trim()).filter(Boolean),
        }),
      });

      const trialIds = form.trialIds.split(',').map((item) => Number(item.trim())).filter(Boolean);
      for (const id of trialIds) {
        try {
          await api(`/api/trials/${id}/join`, { method: 'POST' });
        } catch {
          // Keep onboarding resilient even if one requested join is invalid.
        }
      }

      await refreshUser();
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <form className="form-card" onSubmit={handleSubmit}>
        <p className="eyebrow">Patient onboarding</p>
        <h1>Finish your trial profile</h1>
        <label>
          Date of birth
          <input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
        </label>
        <label>
          Age
          <input type="number" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} />
        </label>
        <label>
          Ethnicity
          <input value={form.ethnicity} onChange={(e) => setForm({ ...form, ethnicity: e.target.value })} />
        </label>
        <label>
          Location
          <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
        </label>
        <label>
          Conditions
          <textarea value={form.conditions} onChange={(e) => setForm({ ...form, conditions: e.target.value })} placeholder="Comma-separated conditions" />
        </label>
        <label>
          Trial IDs to request now
          <input value={form.trialIds} onChange={(e) => setForm({ ...form, trialIds: e.target.value })} placeholder="Optional comma-separated IDs" />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button className="primary-btn" disabled={submitting} type="submit">
          {submitting ? 'Saving...' : 'Enter dashboard'}
        </button>
      </form>
    </div>
  );
}
