import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/useAuth';
import Logo from './Logo';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await login(form);
      navigate(location.state?.from?.pathname || '/dashboard');
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
        <p className="eyebrow">Welcome back</p>
        <h1>Sign in to VitalSight</h1>
        <label>
          Email
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} type="email" required />
        </label>
        <label>
          Password
          <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} type="password" required />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button className="primary-btn" disabled={submitting} type="submit">
          {submitting ? 'Signing in...' : 'Login'}
        </button>
        <p className="muted-text">Need an account? <Link to="/register">Create one</Link>.</p>
      </form>
    </div>
  );
}
