import { Link } from 'react-router-dom';
import Logo from './Logo';

export default function Landing() {
  return (
    <div className="landing">
      <section className="hero-panel">
        <div className="hero-copy">
          <Logo className="hero-logo" subtitle="contactless clinical trial operations" />
          <h1>Recruit, monitor, and retain patients with one privacy-aware workflow.</h1>
          <p className="hero-text">
            VitalSight combines role-based enrollment, secure trial invites, camera-based vitals,
            scheduled forms, and data deletion controls so small research teams can run decentralized
            studies without extra infrastructure.
          </p>
          <div className="hero-actions">
            <Link className="primary-btn" to="/register">Start a trial</Link>
            <Link className="secondary-btn" to="/login">Patient login</Link>
          </div>
        </div>
        <div className="hero-card-grid">
          <article className="info-card accent-card">
            <span className="card-kicker">What patients get</span>
            <h3>Private enrollment plus guided forms and reminders.</h3>
            <p>Patients can discover public studies, accept private invites, and manage preferences from one dashboard.</p>
          </article>
          <article className="info-card">
            <span className="card-kicker">What coordinators get</span>
            <h3>Join approvals, invite links, inbox alerts, and submission review.</h3>
            <p>Everything runs on embedded SQLite with no extra infra requirement on Fly.io.</p>
          </article>
        </div>
      </section>
    </div>
  );
}
