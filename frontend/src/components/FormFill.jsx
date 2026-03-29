import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';

export default function FormFill() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(null);
  const [values, setValues] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/api/forms/${id}`)
      .then((result) => {
        setForm(result.form);
        setValues(Object.fromEntries((result.form.fields || []).map((field) => [field.id, ''])));
      })
      .catch((err) => setError(err.message));
  }, [id]);

  const submit = async (event) => {
    event.preventDefault();
    try {
      await api(`/api/forms/${id}/submit`, {
        method: 'POST',
        body: JSON.stringify({ data: values }),
      });
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    }
  };

  if (!form) {
    return <div className="page-shell"><div className="empty-state">Loading form...</div></div>;
  }

  return (
    <div className="page-shell">
      <section className="panel">
        <p className="eyebrow">Patient form</p>
        <h1>{form.title}</h1>
        <p className="muted-text">{form.description}</p>
        <form className="stack-form" onSubmit={submit}>
          {form.fields.map((field) => (
            <label key={field.id}>
              {field.label}
              {field.type === 'textarea' ? (
                <textarea value={values[field.id] || ''} onChange={(e) => setValues({ ...values, [field.id]: e.target.value })} required={field.required} />
              ) : (
                <input type={field.type === 'number' ? 'number' : 'text'} value={values[field.id] || ''} onChange={(e) => setValues({ ...values, [field.id]: e.target.value })} required={field.required} />
              )}
            </label>
          ))}
          {error && <p className="error-text">{error}</p>}
          <button className="primary-btn" type="submit">Submit form</button>
        </form>
      </section>
    </div>
  );
}
