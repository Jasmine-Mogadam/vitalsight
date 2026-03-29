import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../contexts/useAuth';
import LocationAutocomplete from './LocationAutocomplete';
import PatientConditionsField from './PatientConditionsField';
import { ETHNICITY_OPTIONS } from './patientProfileOptions';

export default function Profile() {
  const { user, refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    if (user.role !== 'patient') return;
    api('/api/patients/profile')
      .then((result) => setProfile(result.profile || {}))
      .catch((err) => setError(err.message));
  }, [user]);

  const savePatientProfile = async (event) => {
    event.preventDefault();
    try {
      await api('/api/patients/profile', {
        method: 'PUT',
        body: JSON.stringify({
          ...profile,
          ethnicity: Array.isArray(profile.ethnicity) ? profile.ethnicity : [],
          conditions: Array.isArray(profile.conditions) ? profile.conditions : [],
        }),
      });
      await refreshUser();
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteAccount = async () => {
    if (!window.confirm('Delete your account and permanently remove your data?')) return;
    try {
      await api('/api/auth/account', { method: 'DELETE' });
      await logout();
      navigate('/');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="page-shell">
      <section className="panel">
        <p className="eyebrow">Profile</p>
        <h1>{user.name}</h1>
        <p className="muted-text">{user.email} • {user.role}</p>
        {user.role === 'patient' ? (
          <form className="stack-form" onSubmit={savePatientProfile}>
            <label>
              Date of birth
              <input type="date" value={profile.date_of_birth || ''} onChange={(e) => setProfile({ ...profile, date_of_birth: e.target.value })} />
            </label>
            <div className="field-stack">
              <div className="field-label-row">
                <span>Ethnicity</span>
                <span className="field-helper">Select all that apply.</span>
              </div>
              <div className="selection-card-grid">
                {ETHNICITY_OPTIONS.map((option) => {
                  const selected = Array.isArray(profile.ethnicity) && profile.ethnicity.includes(option.value);
                  return (
                    <label className={`selection-card ${selected ? 'selected' : ''}`} key={option.value}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => setProfile({
                          ...profile,
                          ethnicity: selected
                            ? profile.ethnicity.filter((item) => item !== option.value)
                            : [...(Array.isArray(profile.ethnicity) ? profile.ethnicity : []), option.value],
                        })}
                      />
                      <span className="selection-card-title">{option.label}</span>
                      <span className="selection-card-copy">{option.description}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <LocationAutocomplete value={profile.location || ''} onChange={(location) => setProfile({ ...profile, location })} />
            <PatientConditionsField
              value={Array.isArray(profile.conditions) ? profile.conditions : []}
              onChange={(conditions) => setProfile({ ...profile, conditions })}
            />
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={profile.notification_prefs?.form_reminders ?? true}
                onChange={(e) => setProfile({
                  ...profile,
                  notification_prefs: {
                    ...(profile.notification_prefs || {}),
                    form_reminders: e.target.checked,
                  },
                })}
              />
              Email me for form reminders
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={profile.notification_prefs?.new_trials ?? true}
                onChange={(e) => setProfile({
                  ...profile,
                  notification_prefs: {
                    ...(profile.notification_prefs || {}),
                    new_trials: e.target.checked,
                  },
                })}
              />
              Notify me about new trials
            </label>
            {error && <p className="error-text">{error}</p>}
            <button className="primary-btn" type="submit">Save profile</button>
          </form>
        ) : (
          <div className="empty-state">Coordinator profile editing is available through registration fields and trial setup.</div>
        )}
        <button className="danger-btn" type="button" onClick={deleteAccount}>Delete account</button>
      </section>
    </div>
  );
}
