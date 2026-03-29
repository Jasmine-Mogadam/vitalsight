import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/useAuth';
import Logo from './Logo';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'patient',
    organization: '',
    title: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const user = await register({
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        profile: form.role === 'coordinator'
          ? { organization: form.organization, title: form.title }
          : {},
      });

      if (user.role === 'patient') {
        navigate('/onboarding');
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <form className="form-card" onSubmit={handleSubmit}>
        <Logo className="auth-logo" stacked />
        <p className="eyebrow">Account creation</p>
        <h1>Create your VitalSight account</h1>
        <label>
          Full name
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </label>
        <label>
          Email
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        </label>
        <label>
          Password
          <input type="password" minLength="8" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        </label>
        <label>
          Role
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="patient">Patient</option>
            <option value="coordinator">Coordinator</option>
          </select>
        </label>
        {form.role === 'coordinator' && (
          <>
            <label>
              Organization
              <input value={form.organization} onChange={(e) => setForm({ ...form, organization: e.target.value })} />
            </label>
            <label>
              Title
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
          </>
        )}
        {error && <p className="error-text">{error}</p>}
        <button className="primary-btn" disabled={submitting} type="submit">
          {submitting ? 'Creating account...' : form.role === 'patient' ? 'Continue to onboarding' : 'Create account'}
        </button>
      </form>
    </div>
  );
}
