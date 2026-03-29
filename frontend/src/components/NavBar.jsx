import { NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/useAuth';
import { api } from '../lib/api';
import Logo from './Logo';

export default function NavBar() {
  const { user, logout } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    let active = true;
    api('/api/inbox/unread-count')
      .then((data) => {
        if (active) setUnreadCount(data.count || 0);
      })
      .catch(() => {
        if (active) setUnreadCount(0);
      });
    return () => {
      active = false;
    };
  }, [user]);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <header className="site-nav">
      <NavLink className="brand" to={user ? '/dashboard' : '/'}>
        <Logo subtitle={user ? `${user.role} portal` : 'clinical trial discovery'} />
      </NavLink>

      <nav className="nav-links">
        {!user && <NavLink to="/">Home</NavLink>}
        {!user && <NavLink to="/login">Login</NavLink>}
        {!user && <NavLink to="/register">Register</NavLink>}
        {user && <NavLink to="/dashboard">Dashboard</NavLink>}
        {user && <NavLink to="/discover">Discover</NavLink>}
        {user && <NavLink to="/monitor">Monitor</NavLink>}
        {user && <NavLink to="/synthetic">Synthetic</NavLink>}
        {user && (
          <NavLink to="/inbox" className="badge-link">
            Inbox
            {unreadCount > 0 && <span className="badge-pill">{unreadCount}</span>}
          </NavLink>
        )}
        {user && <NavLink to="/profile">Profile</NavLink>}
        {user && (
          <button className="ghost-btn" type="button" onClick={handleLogout}>
            Logout
          </button>
        )}
      </nav>
    </header>
  );
}
