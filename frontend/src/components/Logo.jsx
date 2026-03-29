import logoImage from '../assets/logo.svg';

export default function Logo({ subtitle, className = '', imageClassName = '', stacked = false }) {
  const classes = ['logo-lockup', stacked ? 'logo-lockup-stacked' : '', className].filter(Boolean).join(' ');

  return (
    <span className={classes}>
      <img className={['logo-image', imageClassName].filter(Boolean).join(' ')} src={logoImage} alt="VitalSight logo" />
      <span className="logo-copy">
        <span className="logo-wordmark">VitalSight</span>
        {subtitle ? <span className="logo-subtitle">{subtitle}</span> : null}
      </span>
    </span>
  );
}
