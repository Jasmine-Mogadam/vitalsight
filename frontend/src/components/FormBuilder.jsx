import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';

export default function FormBuilder() {
  const { id: trialId } = useParams();
  const [forms, setForms] = useState([]);
  const [formState, setFormState] = useState({
    title: '',
    description: '',
    fieldsText: '[{"id":"symptoms","label":"Symptoms","type":"textarea","required":true}]',
    scheduleType: 'weekly_days',
    scheduleConfig: '{"days":[1],"time":"18:00"}',
  });
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api(`/api/forms/trial/${trialId}`)
      .then((result) => {
        if (active) setForms(result.forms || []);
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [trialId]);

  const load = async () => {
    const result = await api(`/api/forms/trial/${trialId}`);
    setForms(result.forms || []);
  };

  const createForm = async (event) => {
    event.preventDefault();
    try {
      await api('/api/forms', {
        method: 'POST',
        body: JSON.stringify({
          trial_id: Number(trialId),
          title: formState.title,
          description: formState.description,
          fields: JSON.parse(formState.fieldsText),
          schedules: [
            {
              schedule_type: formState.scheduleType,
              schedule_config: JSON.parse(formState.scheduleConfig),
            },
          ],
        }),
      });
      setFormState({
        title: '',
        description: '',
        fieldsText: '[{"id":"symptoms","label":"Symptoms","type":"textarea","required":true}]',
        scheduleType: 'weekly_days',
        scheduleConfig: '{"days":[1],"time":"18:00"}',
      });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="page-shell">
      <section className="panel-grid two-up">
        <article className="panel">
          <p className="eyebrow">Form builder</p>
          <h1>Create a study form</h1>
          <form className="stack-form" onSubmit={createForm}>
            <label>
              Title
              <input value={formState.title} onChange={(e) => setFormState({ ...formState, title: e.target.value })} required />
            </label>
            <label>
              Description
              <textarea value={formState.description} onChange={(e) => setFormState({ ...formState, description: e.target.value })} />
            </label>
            <label>
              Fields JSON
              <textarea value={formState.fieldsText} onChange={(e) => setFormState({ ...formState, fieldsText: e.target.value })} rows="7" />
            </label>
            <label>
              Schedule type
              <select value={formState.scheduleType} onChange={(e) => setFormState({ ...formState, scheduleType: e.target.value })}>
                <option value="weekly_days">Weekly days</option>
                <option value="monthly_day">Monthly day</option>
                <option value="specific_dates">Specific dates</option>
              </select>
            </label>
            <label>
              Schedule config JSON
              <textarea value={formState.scheduleConfig} onChange={(e) => setFormState({ ...formState, scheduleConfig: e.target.value })} rows="4" />
            </label>
            {error && <p className="error-text">{error}</p>}
            <button className="primary-btn" type="submit">Create form</button>
          </form>
        </article>

        <article className="panel">
          <p className="eyebrow">Existing forms</p>
          <h2>Trial form list</h2>
          <div className="stack-list">
            {forms.map((form) => (
              <div className="list-card tall" key={form.id}>
                <div>
                  <h3>{form.title}</h3>
                  <p className="muted-text">{form.description || 'No description yet.'}</p>
                  <p className="muted-text">Fields: {form.fields.length} • Schedules: {form.schedules.length}</p>
                </div>
              </div>
            ))}
            {!forms.length && <div className="empty-state">No forms yet.</div>}
          </div>
        </article>
      </section>
    </div>
  );
}
