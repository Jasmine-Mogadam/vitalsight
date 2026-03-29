import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';

function getInitialValue(field) {
  return field.type === 'multiselect' ? [] : '';
}

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
        setValues(Object.fromEntries((result.form.fields || []).map((field) => [field.id, getInitialValue(field)])));
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
          {form.fields.map((field) => {
            if (field.type === 'multiselect') {
              return (
                <div className="field-stack" key={field.id}>
                  <span>{field.label}</span>
                  <div className="selection-card-grid">
                    {(field.options || []).map((option) => {
                      const selectedValues = values[field.id] || [];
                      const active = selectedValues.includes(option);
                      return (
                        <label className={`selection-card ${active ? 'selected' : ''}`} key={option}>
                          <span className="selection-card-title">{option}</span>
                          <input
                            type="checkbox"
                            checked={active}
                            onChange={(e) => {
                              const nextValues = e.target.checked
                                ? [...selectedValues, option]
                                : selectedValues.filter((item) => item !== option);
                              setValues({ ...values, [field.id]: nextValues });
                            }}
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            }

            return (
              <label key={field.id}>
                {field.label}
                {field.type === 'textarea' && (
                  <textarea value={values[field.id] || ''} onChange={(e) => setValues({ ...values, [field.id]: e.target.value })} required={field.required} />
                )}
                {field.type === 'dropdown' && (
                  <select value={values[field.id] || ''} onChange={(e) => setValues({ ...values, [field.id]: e.target.value })} required={field.required}>
                    <option value="">Select an option</option>
                    {(field.options || []).map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                )}
                {!['textarea', 'dropdown', 'multiselect'].includes(field.type) && (
                  <input
                    type={field.type === 'number' ? 'number' : 'text'}
                    value={values[field.id] || ''}
                    onChange={(e) => setValues({ ...values, [field.id]: e.target.value })}
                    required={field.required}
                  />
                )}
              </label>
            );
          })}
          {error && <p className="error-text">{error}</p>}
          <button className="primary-btn" type="submit">Submit form</button>
        </form>
      </section>
    </div>
  );
}
