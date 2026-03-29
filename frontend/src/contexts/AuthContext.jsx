import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, configureApi, createAuthRecoveryError } from '../lib/api';
import SessionRecoveryDialog from '../components/SessionRecoveryDialog';
import { AuthContext } from './authContextObject';

const SESSION_HEARTBEAT_MS = 4 * 60 * 1000;
const ACTIVE_USER_WINDOW_MS = 10 * 60 * 1000;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionPromptOpen, setSessionPromptOpen] = useState(false);
  const [sessionForm, setSessionForm] = useState({ email: '', password: '' });
  const [sessionError, setSessionError] = useState('');
  const [sessionSubmitting, setSessionSubmitting] = useState(false);

  const reauthPromiseRef = useRef(null);
  const resolveReauthRef = useRef(null);
  const rejectReauthRef = useRef(null);
  const userRef = useRef(user);
  const lastActivityAtRef = useRef(Date.now());
  const lastHeartbeatAtRef = useRef(0);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const clearRecoveryState = useCallback(() => {
    setSessionPromptOpen(false);
    setSessionSubmitting(false);
    setSessionError('');
    setSessionForm((current) => ({ email: current.email, password: '' }));
    reauthPromiseRef.current = null;
    resolveReauthRef.current = null;
    rejectReauthRef.current = null;
  }, []);

  const login = useCallback(async (payload) => {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
      skipAuthRecovery: true,
    });
    setUser(data.user);
    lastHeartbeatAtRef.current = Date.now();
    return data.user;
  }, []);

  const register = useCallback(async (payload) => {
    const data = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
      skipAuthRecovery: true,
    });
    setUser(data.user);
    lastHeartbeatAtRef.current = Date.now();
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    await api('/api/auth/logout', { method: 'POST', skipAuthRecovery: true });
    setUser(null);
    clearRecoveryState();
  }, [clearRecoveryState]);

  const refreshUser = useCallback(async ({ allowRecovery, preserveUser } = {}) => {
    const hasActiveUser = Boolean(userRef.current);
    const shouldAllowRecovery = allowRecovery ?? hasActiveUser;
    const shouldPreserveUser = preserveUser ?? hasActiveUser;

    try {
      const data = await api('/api/auth/me', {
        skipAuthRecovery: !shouldAllowRecovery,
      });
      setUser(data.user);
      lastHeartbeatAtRef.current = Date.now();
      return data.user;
    } catch {
      if (!shouldPreserveUser) {
        setUser(null);
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const requestReauthentication = useCallback(() => {
    if (reauthPromiseRef.current) {
      return reauthPromiseRef.current;
    }

    setSessionForm({
      email: userRef.current?.email || '',
      password: '',
    });
    setSessionError('');
    setSessionSubmitting(false);
    setSessionPromptOpen(true);

    reauthPromiseRef.current = new Promise((resolve, reject) => {
      resolveReauthRef.current = resolve;
      rejectReauthRef.current = reject;
    });

    return reauthPromiseRef.current;
  }, []);

  useEffect(() => {
    configureApi({ onAuthRequired: requestReauthentication });
    return () => configureApi({ onAuthRequired: null });
  }, [requestReauthentication]);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const refreshSessionInBackground = useCallback(async () => {
    if (!userRef.current) {
      return;
    }

    const now = Date.now();
    if (now - lastHeartbeatAtRef.current < SESSION_HEARTBEAT_MS) {
      return;
    }

    if (now - lastActivityAtRef.current > ACTIVE_USER_WINDOW_MS) {
      return;
    }

    try {
      const data = await api('/api/auth/me');
      setUser(data.user);
      lastHeartbeatAtRef.current = Date.now();
    } catch (error) {
      if (error?.code !== 'AUTH_RECOVERY_CANCELLED') {
        console.error('Unable to refresh session', error);
      }
    }
  }, []);

  useEffect(() => {
    if (!user) {
      return undefined;
    }

    const markActivity = () => {
      lastActivityAtRef.current = Date.now();
      refreshSessionInBackground();
    };

    const interval = window.setInterval(refreshSessionInBackground, 60 * 1000);

    window.addEventListener('pointerdown', markActivity);
    window.addEventListener('keydown', markActivity);
    window.addEventListener('focus', markActivity);
    document.addEventListener('visibilitychange', markActivity);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('pointerdown', markActivity);
      window.removeEventListener('keydown', markActivity);
      window.removeEventListener('focus', markActivity);
      document.removeEventListener('visibilitychange', markActivity);
    };
  }, [refreshSessionInBackground, user]);

  const handleSessionFieldChange = useCallback((field, value) => {
    setSessionForm((current) => ({ ...current, [field]: value }));
  }, []);

  const dismissSessionPrompt = useCallback(() => {
    rejectReauthRef.current?.(createAuthRecoveryError());
    clearRecoveryState();
  }, [clearRecoveryState]);

  const submitSessionRecovery = useCallback(async (event) => {
    event.preventDefault();
    setSessionSubmitting(true);
    setSessionError('');

    try {
      const refreshedUser = await login(sessionForm);
      resolveReauthRef.current?.(refreshedUser);
      clearRecoveryState();
    } catch (error) {
      setSessionError(error.message || 'Unable to restore your session.');
      setSessionSubmitting(false);
    }
  }, [clearRecoveryState, login, sessionForm]);

  const contextValue = useMemo(() => ({
    user,
    setUser,
    loading,
    login,
    register,
    logout,
    refreshUser,
  }), [loading, login, logout, refreshUser, register, user]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
      {sessionPromptOpen && (
        <SessionRecoveryDialog
          email={sessionForm.email}
          password={sessionForm.password}
          error={sessionError}
          submitting={sessionSubmitting}
          onChange={handleSessionFieldChange}
          onDismiss={dismissSessionPrompt}
          onSubmit={submitSessionRecovery}
        />
      )}
    </AuthContext.Provider>
  );
}
