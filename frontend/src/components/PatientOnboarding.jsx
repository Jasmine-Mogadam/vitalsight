import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../contexts/useAuth';
import LocationAutocomplete from './LocationAutocomplete';
import PatientConditionsField from './PatientConditionsField';
import TagInput from './TagInput';
import { ETHNICITY_OPTIONS } from './patientProfileOptions';

export default function PatientOnboarding() {
  const { refreshUser } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    date_of_birth: '',
    ethnicity: [],
    location: '',
    conditions: [],
    trialIds: [],
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const skipForNow = async () => {
    await refreshUser();
    navigate('/dashboard');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api('/api/patients/profile', {
        method: 'PUT',
        body: JSON.stringify({
          date_of_birth: form.date_of_birth,
          ethnicity: form.ethnicity,
          location: form.location,
          conditions: form.conditions,
        }),
      });

      const trialIds = form.trialIds.map((item) => Number(item)).filter(Boolean);
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
      <form className="form-card onboarding-form" onSubmit={handleSubmit}>
        <div className="onboarding-topbar">
          <button type="button" className="secondary-btn" onClick={skipForNow}>
            Skip for now
          </button>
          <span className="field-helper">This profile is optional and can be completed later.</span>
        </div>
        <p className="eyebrow">Patient onboarding</p>
        <h1>Finish your trial profile</h1>
        <p className="subtitle">Add only the information you want us to use for clinical trial matching.</p>
        <label>
          Date of birth
          <input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
        </label>
        <div className="field-stack">
          <div className="field-label-row">
            <span>Ethnicity</span>
            <span className="field-helper">Select all that apply.</span>
          </div>
          <div className="selection-card-grid">
            {ETHNICITY_OPTIONS.map((option) => {
              const checked = form.ethnicity.includes(option.value);
              return (
                <label className={`selection-card ${checked ? 'selected' : ''}`} key={option.value}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => setForm({
                      ...form,
                      ethnicity: checked
                        ? form.ethnicity.filter((item) => item !== option.value)
                        : [...form.ethnicity, option.value],
                    })}
                  />
                  <span className="selection-card-title">{option.label}</span>
                  <span className="selection-card-copy">{option.description}</span>
                </label>
              );
            })}
          </div>
        </div>
        <LocationAutocomplete value={form.location} onChange={(location) => setForm({ ...form, location })} />
        <PatientConditionsField value={form.conditions} onChange={(conditions) => setForm({ ...form, conditions })} />
        <TagInput
          label="Trial IDs to request now"
          value={form.trialIds}
          onChange={(trialIds) => setForm({ ...form, trialIds })}
          placeholder="Type an ID and press Enter"
          inputMode="numeric"
          helperText="Optional. Add each trial ID as its own tag."
          normalizeValue={(rawValue) => {
            const digits = rawValue.replace(/[^\d]/g, '');
            return digits || '';
          }}
        />
        {error && <p className="error-text">{error}</p>}
        <div className="onboarding-actions">
          <button type="button" className="ghost-btn" onClick={skipForNow}>
            Skip for now
          </button>
          <button className="primary-btn" disabled={submitting} type="submit">
            {submitting ? 'Saving...' : 'Enter dashboard'}
          </button>
        </div>
      </form>
    </div>
  );
}
