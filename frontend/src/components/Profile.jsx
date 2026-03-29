import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../contexts/useAuth';

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
          conditions: typeof profile.conditions === 'string'
            ? profile.conditions.split(',').map((item) => item.trim()).filter(Boolean)
            : profile.conditions,
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
            <label>
              Age
              <input type="number" value={profile.age || ''} onChange={(e) => setProfile({ ...profile, age: e.target.value })} />
            </label>
            <label>
              Ethnicity
              <input value={profile.ethnicity || ''} onChange={(e) => setProfile({ ...profile, ethnicity: e.target.value })} />
            </label>
            <label>
              Location
              <input value={profile.location || ''} onChange={(e) => setProfile({ ...profile, location: e.target.value })} />
            </label>
            <label>
              Conditions
              <textarea value={Array.isArray(profile.conditions) ? profile.conditions.join(', ') : (profile.conditions || '')} onChange={(e) => setProfile({ ...profile, conditions: e.target.value })} />
            </label>
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
