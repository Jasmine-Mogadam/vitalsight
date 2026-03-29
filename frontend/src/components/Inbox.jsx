import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function Inbox() {
  const [messages, setMessages] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api('/api/inbox')
      .then((result) => {
        if (!active) return;
        setMessages(result.items || []);
        setSelected((result.items || [])[0] || null);
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, []);

  const markRead = async (message) => {
    await api(`/api/inbox/${message.id}/read`, { method: 'PATCH' });
    setMessages((items) => items.map((item) => (item.id === message.id ? { ...item, read: 1 } : item)));
    setSelected({ ...message, read: 1 });
  };

  const remove = async (message) => {
    await api(`/api/inbox/${message.id}`, { method: 'DELETE' });
    const next = messages.filter((item) => item.id !== message.id);
    setMessages(next);
    setSelected(next[0] || null);
  };

  return (
    <div className="page-shell">
      <section className="panel-grid two-up">
        <article className="panel">
          <p className="eyebrow">Inbox</p>
          <h1>Messages</h1>
          {error && <p className="error-text">{error}</p>}
          <div className="stack-list">
            {messages.map((message) => (
              <button
                key={message.id}
                type="button"
                className={`message-item ${selected?.id === message.id ? 'active' : ''}`}
                onClick={() => setSelected(message)}
              >
                <strong>{message.subject}</strong>
                <span>{message.type}</span>
              </button>
            ))}
            {!messages.length && <div className="empty-state">No messages yet.</div>}
          </div>
        </article>

        <article className="panel">
          <p className="eyebrow">Detail</p>
          {selected ? (
            <>
              <h2>{selected.subject}</h2>
              <p className="muted-text">{new Date(selected.created_at).toLocaleString()}</p>
              <p className="detail-copy">{selected.body}</p>
              <div className="action-row">
                {!selected.read && <button className="primary-btn" type="button" onClick={() => markRead(selected)}>Mark read</button>}
                <button className="secondary-btn" type="button" onClick={() => remove(selected)}>Delete</button>
              </div>
            </>
          ) : (
            <div className="empty-state">Select a message to read it.</div>
          )}
        </article>
      </section>
    </div>
  );
}
