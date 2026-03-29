import { Link } from 'react-router-dom';
import Logo from './Logo';

const impactPoints = [
  'Remote trial participation without wearables or clinic travel.',
  'Inclusive access for rural communities, caregivers, and lower-mobility patients.',
  'Inbox, reminders, and guided check-ins that reduce trial dropout risk.',
];

const businessPoints = [
  '$50-200 PPPM SaaS model for CROs and sponsors.',
  'Shared trial network reduces repeat enrollment setup cost.',
  'AI + audit trail + scheduling improves compliance confidence.',
];

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

      <section className="content-grid">
        <article className="panel">
          <p className="eyebrow">Business plan</p>
          <h2>Built for faster decentralized trial execution</h2>
          <ul className="stack-list">
            {businessPoints.map((item) => <li key={item}>{item}</li>)}
          </ul>
          <p className="muted-text">
            The platform focuses on lower-friction enrollment and retention, where trial delays, dropouts,
            and manual follow-up create outsized cost.
          </p>
        </article>

        <article className="panel">
          <p className="eyebrow">Social impact</p>
          <h2>Reduce the access gap for underserved participants</h2>
          <ul className="stack-list">
            {impactPoints.map((item) => <li key={item}>{item}</li>)}
          </ul>
          <p className="muted-text">
            Bringing enrollment and monitoring into the home helps more trial populations reflect the
            patients treatments are actually meant to serve.
          </p>
        </article>
      </section>
    </div>
  );
}
