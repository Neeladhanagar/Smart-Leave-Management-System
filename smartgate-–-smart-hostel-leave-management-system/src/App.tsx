import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ROLE_HOME_ROUTES } from './utils/formatters';

import { LoginPage } from './pages/LoginPage';
import { UnauthorizedPage } from './pages/UnauthorizedPage';
import { StudentDashboard } from './dashboards/StudentDashboard/StudentDashboard';
import { CoordinatorDashboard } from './dashboards/CoordinatorDashboard/CoordinatorDashboard';
import { MentorDashboard } from './dashboards/MentorDashboard/MentorDashboard';
import { HODDashboard } from './dashboards/HODDashboard/HODDashboard';
import { SWODashboard } from './dashboards/SWODashboard/SWODashboard';
import { WardenDashboard } from './dashboards/WardenDashboard/WardenDashboard';
import { AODashboard } from './dashboards/AODashboard/AODashboard';
import { SecurityDashboard } from './dashboards/SecurityDashboard/SecurityDashboard';
import { AdminDashboard } from './dashboards/AdminDashboard/AdminDashboard';
import { EmergencyControlDashboard } from './dashboards/EmergencyControlDashboard/EmergencyControlDashboard';

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={ROLE_HOME_ROUTES[user.role]} replace />;
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/unauthorized" element={<UnauthorizedPage />} />

            <Route
              path="/student/*"
              element={
                <ProtectedRoute allowedRoles={['STUDENT']}>
                  <StudentDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/coordinator/*"
              element={
                <ProtectedRoute allowedRoles={['COORDINATOR']}>
                  <CoordinatorDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/mentor/*"
              element={
                <ProtectedRoute allowedRoles={['MENTOR']}>
                  <MentorDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/hod/*"
              element={
                <ProtectedRoute allowedRoles={['HOD']}>
                  <HODDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/swo/*"
              element={
                <ProtectedRoute allowedRoles={['SWO']}>
                  <SWODashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/warden/*"
              element={
                <ProtectedRoute allowedRoles={['WARDEN']}>
                  <WardenDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/ao/*"
              element={
                <ProtectedRoute allowedRoles={['AO']}>
                  <AODashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/security/*"
              element={
                <ProtectedRoute allowedRoles={['SECURITY']}>
                  <SecurityDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/*"
              element={
                <ProtectedRoute allowedRoles={['ADMIN']}>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/emergency-control/*"
              element={
                <ProtectedRoute allowedRoles={['EMERGENCY_CONTROL']}>
                  <EmergencyControlDashboard />
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<RootRedirect />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  );
}
