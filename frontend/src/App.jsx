import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './App.css';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import NavBar from './components/NavBar';
import Landing from './components/Landing';
import Login from './components/Login';
import Register from './components/Register';
import PatientOnboarding from './components/PatientOnboarding';
import Dashboard from './components/Dashboard';
import DiscoveryTab from './components/DiscoveryTab';
import TrialDetails from './components/TrialDetails';
import Inbox from './components/Inbox';
import TrialManagement from './components/TrialManagement';
import FormBuilder from './components/FormBuilder';
import FormFill from './components/FormFill';
import Profile from './components/Profile';
import JoinTrial from './components/JoinTrial';
import MonitorPage from './pages/MonitorPage';
import BusinessPlanPage from './pages/BusinessPlanPage';
import SocialImpactPage from './pages/SocialImpactPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="app-shell">
          <NavBar />
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/business-plan" element={<BusinessPlanPage />} />
            <Route path="/social-impact" element={<SocialImpactPage />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/join/:token" element={<JoinTrial />} />
            <Route
              path="/onboarding"
              element={
                <ProtectedRoute role="patient">
                  <PatientOnboarding />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/monitor"
              element={
                <ProtectedRoute>
                  <MonitorPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/discover"
              element={<DiscoveryTab />}
            />
            <Route path="/discover/:id" element={<TrialDetails />} />
            <Route
              path="/inbox"
              element={
                <ProtectedRoute>
                  <Inbox />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              }
            />
            <Route
              path="/trials/:id"
              element={
                <ProtectedRoute role="coordinator">
                  <TrialManagement />
                </ProtectedRoute>
              }
            />
            <Route
              path="/trials/:id/forms"
              element={
                <ProtectedRoute role="coordinator">
                  <FormBuilder />
                </ProtectedRoute>
              }
            />
            <Route
              path="/forms/:id/fill"
              element={
                <ProtectedRoute role="patient">
                  <FormFill />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate replace to="/" />} />
          </Routes>
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}
