import { useEffect, useRef, useState } from 'react';
import { Link, useBeforeUnload, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import Toast from './Toast';

const FIELD_TYPE_OPTIONS = [
  { value: 'text', label: 'Short text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'multiselect', label: 'Multi-select' },
];

const WEEKDAY_OPTIONS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

function slugifyFieldId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function splitOptions(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function createScheduleConfig(scheduleType) {
  if (scheduleType === 'monthly_day') {
    return { day: 1, time: '18:00' };
  }
  if (scheduleType === 'specific_dates') {
    return { dates: [], time: '18:00' };
  }
  return { days: [1], time: '18:00' };
}

function serializeBuilderState(editingFormId, formState) {
  return JSON.stringify({
    editingFormId,
    title: formState.title,
    description: formState.description,
    fields: formState.fields.map((field) => ({
      id: field.id,
      label: field.label,
      type: field.type,
      required: field.required,
      optionsText: field.optionsText || '',
    })),
    schedules: formState.schedules.map((schedule) => ({
      schedule_type: schedule.schedule_type,
      schedule_config: schedule.schedule_config,
      notify_email: schedule.notify_email,
    })),
  });
}

export default function FormBuilder() {
  const { id: trialId } = useParams();
  const navigate = useNavigate();
  const nextFieldKey = useRef(0);
  const nextScheduleKey = useRef(0);
  const pendingActionRef = useRef(null);
  const hasBrowserBackGuard = useRef(false);
  const allowBrowserBackRef = useRef(false);
  const [forms, setForms] = useState([]);
  const [formState, setFormState] = useState(createBlankFormState());
  const [editingFormId, setEditingFormId] = useState(null);
  const [savedState, setSavedState] = useState(() => serializeBuilderState(null, createBlankFormState()));
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [error, setError] = useState('');
  const [toastMessage, setToastMessage] = useState('');

  function createBlankField() {
    return {
      localKey: `field-${nextFieldKey.current++}`,
      id: '',
      label: '',
      type: 'text',
      required: true,
      optionsText: '',
    };
  }

  function createBlankSchedule() {
    return {
      localKey: `schedule-${nextScheduleKey.current++}`,
      schedule_type: 'weekly_days',
      schedule_config: createScheduleConfig('weekly_days'),
      notify_email: true,
    };
  }

  function createBlankFormState() {
    return {
      title: '',
      description: '',
      fields: [createBlankField()],
      schedules: [createBlankSchedule()],
    };
  }

  function normalizeSchedule(schedule) {
    const scheduleType = schedule.schedule_type || 'weekly_days';
    const baseConfig = createScheduleConfig(scheduleType);
    return {
      localKey: `schedule-${nextScheduleKey.current++}`,
      schedule_type: scheduleType,
      notify_email: schedule.notify_email !== false,
      schedule_config: {
        ...baseConfig,
        ...(schedule.schedule_config || {}),
      },
    };
  }

  function normalizeField(field) {
    return {
      localKey: `field-${nextFieldKey.current++}`,
      id: field.id || slugifyFieldId(field.label),
      label: field.label || '',
      type: field.type || 'text',
      required: field.required !== false,
      optionsText: splitOptions(field.options).join(', '),
    };
  }

  function normalizeForm(form) {
    return {
      title: form.title || '',
      description: form.description || '',
      fields: (form.fields || []).length ? form.fields.map(normalizeField) : [createBlankField()],
      schedules: (form.schedules || []).length ? form.schedules.map(normalizeSchedule) : [createBlankSchedule()],
    };
  }

  function buildScheduleConfig(schedule) {
    if (schedule.schedule_type === 'weekly_days') {
      return {
        days: schedule.schedule_config.days || [],
        time: schedule.schedule_config.time || '18:00',
      };
    }
    if (schedule.schedule_type === 'monthly_day') {
      return {
        day: Number(schedule.schedule_config.day) || 1,
        time: schedule.schedule_config.time || '18:00',
      };
    }
    return {
      dates: (schedule.schedule_config.dates || []).filter(Boolean),
      time: schedule.schedule_config.time || '18:00',
    };
  }

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

  const isDirty = serializeBuilderState(editingFormId, formState) !== savedState;

  useBeforeUnload((event) => {
    if (!isDirty) return;
    event.preventDefault();
  });

  useEffect(() => {
    if (!isDirty || hasBrowserBackGuard.current) return;
    window.history.pushState({ formBuilderGuard: true }, '', window.location.href);
    hasBrowserBackGuard.current = true;
  }, [isDirty]);

  useEffect(() => {
    const handlePopState = () => {
      if (!isDirty) return;
      if (allowBrowserBackRef.current) {
        allowBrowserBackRef.current = false;
        return;
      }

      pendingActionRef.current = () => {
        allowBrowserBackRef.current = true;
        hasBrowserBackGuard.current = false;
        window.history.back();
      };
      setShowLeaveConfirm(true);
      window.history.pushState({ formBuilderGuard: true }, '', window.location.href);
      hasBrowserBackGuard.current = true;
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isDirty]);

  useEffect(() => {
    const handleDocumentClick = (event) => {
      if (!isDirty) return;
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = event.target.closest('a[href]');
      if (!anchor) return;
      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const nextPath = `${url.pathname}${url.search}${url.hash}`;
      const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (nextPath === currentPath) return;

      event.preventDefault();
      pendingActionRef.current = () => {
        hasBrowserBackGuard.current = false;
        navigate(nextPath);
      };
      setShowLeaveConfirm(true);
    };

    document.addEventListener('click', handleDocumentClick, true);
    return () => {
      document.removeEventListener('click', handleDocumentClick, true);
    };
  }, [isDirty, navigate]);

  const resetBuilder = () => {
    const blankState = createBlankFormState();
    setEditingFormId(null);
    setFormState(blankState);
    setSavedState(serializeBuilderState(null, blankState));
  };

  const updateField = (localKey, updates) => {
    setFormState((current) => ({
      ...current,
      fields: current.fields.map((field) => {
        if (field.localKey !== localKey) return field;
        const next = { ...field, ...updates };
        if (Object.prototype.hasOwnProperty.call(updates, 'label')) {
          const currentSlug = slugifyFieldId(field.label);
          if (!field.id || field.id === currentSlug) {
            next.id = slugifyFieldId(updates.label);
          }
        }
        if (updates.type && !['dropdown', 'multiselect'].includes(updates.type)) {
          next.optionsText = '';
        }
        return next;
      }),
    }));
  };

  const addField = () => {
    setFormState((current) => ({ ...current, fields: [...current.fields, createBlankField()] }));
  };

  const removeField = (localKey) => {
    setFormState((current) => ({
      ...current,
      fields: current.fields.filter((field) => field.localKey !== localKey),
    }));
  };

  const updateSchedule = (localKey, schedule) => {
    setFormState((current) => ({
      ...current,
      schedules: current.schedules.map((item) => (item.localKey === localKey ? schedule : item)),
    }));
  };

  const changeScheduleType = (localKey, scheduleType) => {
    setFormState((current) => ({
      ...current,
      schedules: current.schedules.map((schedule) => (
        schedule.localKey === localKey
          ? {
              ...schedule,
              schedule_type: scheduleType,
              schedule_config: createScheduleConfig(scheduleType),
            }
          : schedule
      )),
    }));
  };

  const addSchedule = () => {
    setFormState((current) => ({ ...current, schedules: [...current.schedules, createBlankSchedule()] }));
  };

  const removeSchedule = (localKey) => {
    setFormState((current) => ({
      ...current,
      schedules: current.schedules.filter((schedule) => schedule.localKey !== localKey),
    }));
  };

  const saveForm = async (event) => {
    event.preventDefault();
    setError('');

    try {
      const payload = {
        trial_id: Number(trialId),
        title: formState.title,
        description: formState.description,
        fields: formState.fields.map((field) => {
          const nextField = {
            id: field.id || slugifyFieldId(field.label),
            label: field.label,
            type: field.type,
            required: field.required !== false,
          };
          if (['dropdown', 'multiselect'].includes(field.type)) {
            nextField.options = splitOptions(field.optionsText);
          }
          return nextField;
        }),
        schedules: formState.schedules.map((schedule) => ({
          schedule_type: schedule.schedule_type,
          schedule_config: buildScheduleConfig(schedule),
          notify_email: schedule.notify_email !== false,
        })),
      };

      if (editingFormId) {
        await api(`/api/forms/${editingFormId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await api('/api/forms', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      setToastMessage(editingFormId ? 'Form changes saved.' : 'Form created.');
      setSavedState(serializeBuilderState(null, createBlankFormState()));
      resetBuilder();
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const editForm = (form) => {
    const nextState = normalizeForm(form);
    setEditingFormId(form.id);
    setFormState(nextState);
    setSavedState(serializeBuilderState(form.id, nextState));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteForm = async (formId) => {
    const confirmed = window.confirm('Delete this form and all submissions?');
    if (!confirmed) return;

    try {
      await api(`/api/forms/${formId}`, { method: 'DELETE' });
      if (editingFormId === formId) {
        resetBuilder();
      }
      await load();
      setToastMessage('Form deleted.');
    } catch (err) {
      setError(err.message);
    }
  };

  const attemptLeave = (target) => {
    if (!isDirty) {
      navigate(target);
      return;
    }
    pendingActionRef.current = () => {
      hasBrowserBackGuard.current = false;
      navigate(target);
    };
    setShowLeaveConfirm(true);
  };

  const stayOnPage = () => {
    setShowLeaveConfirm(false);
    pendingActionRef.current = null;
  };

  const leavePage = () => {
    setShowLeaveConfirm(false);
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    if (action) {
      action();
      return;
    }
    hasBrowserBackGuard.current = false;
    navigate(`/trials/${trialId}`);
  };

  return (
    <div className="page-shell">
      <section className="panel-grid two-up">
        <article className="panel">
          <div className="panel-header-row">
            <div>
              <p className="eyebrow">Form builder</p>
              <h1>{editingFormId ? 'Edit study form' : 'Create a study form'}</h1>
            </div>
            <button className="secondary-btn back-arrow-btn" type="button" onClick={() => attemptLeave(`/trials/${trialId}`)}>
              ← Back to trial
            </button>
          </div>
          <form className="stack-form" onSubmit={saveForm}>
            <label>
              Title
              <input value={formState.title} onChange={(e) => setFormState({ ...formState, title: e.target.value })} required />
            </label>
            <label>
              Description
              <textarea value={formState.description} onChange={(e) => setFormState({ ...formState, description: e.target.value })} />
            </label>

            <div className="builder-section">
              <div className="builder-section-header">
                <div>
                  <h3>Fields</h3>
                  <p className="muted-text">Build the patient form with regular inputs instead of editing JSON.</p>
                </div>
              </div>
              <div className="stack-list">
                {formState.fields.map((field, index) => (
                  <div className="builder-card" key={field.localKey}>
                    <div className="builder-card-header">
                      <button
                        className="danger-btn slim danger-inline-btn"
                        type="button"
                        onClick={() => removeField(field.localKey)}
                        disabled={formState.fields.length === 1}
                      >
                        Delete field
                      </button>
                      <h3>Field {index + 1}</h3>
                    </div>
                    <div className="builder-grid">
                      <label>
                        Label
                        <input value={field.label} onChange={(e) => updateField(field.localKey, { label: e.target.value })} required />
                      </label>
                      <label>
                        Field ID
                        <input value={field.id} onChange={(e) => updateField(field.localKey, { id: slugifyFieldId(e.target.value) })} placeholder="auto_generated_id" />
                      </label>
                      <label>
                        Type
                        <select value={field.type} onChange={(e) => updateField(field.localKey, { type: e.target.value })}>
                          {FIELD_TYPE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="checkbox-row builder-checkbox">
                        <input type="checkbox" checked={field.required !== false} onChange={(e) => updateField(field.localKey, { required: e.target.checked })} />
                        Required
                      </label>
                      {['dropdown', 'multiselect'].includes(field.type) && (
                        <label className="full-width">
                          Options
                          <textarea
                            value={field.optionsText}
                            onChange={(e) => updateField(field.localKey, { optionsText: e.target.value })}
                            placeholder="Option A, Option B, Option C"
                          />
                        </label>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <button className="secondary-btn add-builder-btn" type="button" onClick={addField}>+ Add field</button>
            </div>

            <div className="builder-section">
              <div className="builder-section-header">
                <div>
                  <h3>Schedules</h3>
                  <p className="muted-text">Choose a schedule type, then fill in the matching settings.</p>
                </div>
              </div>
              <div className="stack-list">
                {formState.schedules.map((schedule, index) => (
                  <div className="builder-card" key={schedule.localKey}>
                    <div className="builder-card-header builder-card-header-spread">
                      <h3>Schedule {index + 1}</h3>
                      <button
                        className="danger-btn slim danger-inline-btn"
                        type="button"
                        onClick={() => removeSchedule(schedule.localKey)}
                        disabled={formState.schedules.length === 1}
                      >
                        Delete schedule
                      </button>
                    </div>
                    <div className="builder-grid">
                      <label>
                        Schedule type
                        <select value={schedule.schedule_type} onChange={(e) => changeScheduleType(schedule.localKey, e.target.value)}>
                          <option value="weekly_days">Weekly days</option>
                          <option value="monthly_day">Monthly day</option>
                          <option value="specific_dates">Specific dates</option>
                        </select>
                      </label>

                      {schedule.schedule_type === 'weekly_days' && (
                        <label className="full-width">
                          Days of week
                          <div className="selection-card-grid compact">
                            {WEEKDAY_OPTIONS.map((day) => {
                              const active = (schedule.schedule_config.days || []).includes(day.value);
                              return (
                                <button
                                  key={day.value}
                                  className={`chip-toggle ${active ? 'active' : ''}`}
                                  type="button"
                                  onClick={() => {
                                    const currentDays = schedule.schedule_config.days || [];
                                    const nextDays = active
                                      ? currentDays.filter((value) => value !== day.value)
                                      : [...currentDays, day.value].sort();
                                    updateSchedule(schedule.localKey, {
                                      ...schedule,
                                      schedule_config: { ...schedule.schedule_config, days: nextDays },
                                    });
                                  }}
                                >
                                  {day.label}
                                </button>
                              );
                            })}
                          </div>
                        </label>
                      )}

                      {schedule.schedule_type === 'monthly_day' && (
                        <label>
                          Day of month
                          <input
                            type="number"
                            min="1"
                            max="31"
                            value={schedule.schedule_config.day || 1}
                            onChange={(e) => updateSchedule(schedule.localKey, {
                              ...schedule,
                              schedule_config: { ...schedule.schedule_config, day: e.target.value },
                            })}
                          />
                        </label>
                      )}

                      {schedule.schedule_type === 'specific_dates' && (
                        <label className="full-width">
                          Specific dates
                          <textarea
                            value={(schedule.schedule_config.dates || []).join(', ')}
                            onChange={(e) => updateSchedule(schedule.localKey, {
                              ...schedule,
                              schedule_config: {
                                ...schedule.schedule_config,
                                dates: e.target.value.split(',').map((item) => item.trim()).filter(Boolean),
                              },
                            })}
                            placeholder="2026-04-03, 2026-04-17"
                          />
                        </label>
                      )}

                      <label>
                        Reminder time
                        <input
                          type="time"
                          value={schedule.schedule_config.time || '18:00'}
                          onChange={(e) => updateSchedule(schedule.localKey, {
                            ...schedule,
                            schedule_config: { ...schedule.schedule_config, time: e.target.value },
                          })}
                        />
                      </label>
                      <label className="checkbox-row builder-checkbox">
                        <input
                          type="checkbox"
                          checked={schedule.notify_email !== false}
                          onChange={(e) => updateSchedule(schedule.localKey, { ...schedule, notify_email: e.target.checked })}
                        />
                        Email reminder
                      </label>
                      <p className="field-helper full-width">Reminder emails are skipped for patients who have email notifications disabled.</p>
                    </div>
                  </div>
                ))}
              </div>
              <button className="secondary-btn add-builder-btn" type="button" onClick={addSchedule}>+ Add schedule</button>
            </div>

            {error && <p className="error-text">{error}</p>}
            <div className="action-row">
              <button className="primary-btn" type="submit">{editingFormId ? 'Save form' : 'Create form'}</button>
              {editingFormId && <button className="secondary-btn" type="button" onClick={resetBuilder}>Cancel edit</button>}
            </div>
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
                  <p className="muted-text form-list-description">{form.description || 'No description yet.'}</p>
                  <p className="muted-text">Fields: {form.fields.length} • Schedules: {form.schedules.length}</p>
                </div>
                <div className="action-row">
                  <button className="secondary-btn" type="button" onClick={() => editForm(form)}>Edit</button>
                  <button className="danger-btn slim" type="button" onClick={() => deleteForm(form.id)}>Delete</button>
                </div>
              </div>
            ))}
            {!forms.length && <div className="empty-state">No forms yet.</div>}
          </div>
        </article>
      </section>
      {showLeaveConfirm && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="leave-form-builder-title">
            <p className="eyebrow">Unsaved changes</p>
            <h2 id="leave-form-builder-title">Leave this form page?</h2>
            <p className="muted-text">You have unsaved changes in the form builder. Leaving now will discard them.</p>
            <div className="action-row">
              <button className="primary-btn" type="button" onClick={stayOnPage}>Stay here</button>
              <button className="danger-btn slim" type="button" onClick={leavePage}>Leave without saving</button>
            </div>
          </div>
        </div>
      )}
      <Toast message={toastMessage} onClose={() => setToastMessage('')} />
    </div>
  );
}
