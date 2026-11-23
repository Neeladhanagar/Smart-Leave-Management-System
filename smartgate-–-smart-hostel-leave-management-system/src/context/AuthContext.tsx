import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiRequest, getStoredToken, setStoredToken } from '../services/api';
import type { UserProfile, StudentProfile, AuthorityProfile, AppSettings, RegistrationRole } from '../types';

export interface StudentRegisterInput {
  name: string;
  usn: string;
  email: string;
  phone: string;
  department: string;
  semester: number;
  section: string;
  hostelBlock?: string;
  roomNumber?: string;
  parentPhone?: string;
  password: string;
  confirmPassword?: string;
}

interface AuthContextValue {
  user: UserProfile | null;
  studentProfile: StudentProfile | null;
  authorityProfile: AuthorityProfile | null;
  settings: AppSettings | null;
  unreadNotifications: number;
  loading: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<UserProfile>;
  registerStudent: (payload: StudentRegisterInput) => Promise<UserProfile>;
  submitRegistration: (
    payload: Record<string, string | RegistrationRole | number>
  ) => Promise<{ message: string; accountStatus: 'ACTIVE' }>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
  setUnreadNotifications: React.Dispatch<React.SetStateAction<number>>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  const [authorityProfile, setAuthorityProfile] = useState<AuthorityProfile | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setStudentProfile(null);
      setAuthorityProfile(null);
      setLoading(false);
      return;
    }

    try {
      const data = await apiRequest<{
        user: UserProfile;
        studentProfile: StudentProfile | null;
        authorityProfile: AuthorityProfile | null;
        unreadNotifications: number;
        settings: AppSettings | null;
      }>('/auth/me');

      setUser(data.user);
      setStudentProfile(data.studentProfile);
      setAuthorityProfile(data.authorityProfile);
      setUnreadNotifications(data.unreadNotifications || 0);
      setSettings(data.settings);
    } catch {
      setStoredToken(null);
      setUser(null);
      setStudentProfile(null);
      setAuthorityProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshProfile();

    const handleUnauthorized = () => {
      setUser(null);
      setStudentProfile(null);
      setAuthorityProfile(null);
    };
    window.addEventListener('smartgate:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('smartgate:unauthorized', handleUnauthorized);
  }, [refreshProfile]);

  const login = async (
    email: string,
    password: string,
    rememberMe = true
  ): Promise<UserProfile> => {
    const data = await apiRequest<{
      token: string;
      user: UserProfile;
      studentProfile: StudentProfile | null;
      authorityProfile: AuthorityProfile | null;
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    setStoredToken(data.token, rememberMe);
    setUser(data.user);
    setStudentProfile(data.studentProfile);
    setAuthorityProfile(data.authorityProfile);
    await refreshProfile();
    return data.user;
  };

  const registerStudent = async (payload: StudentRegisterInput): Promise<UserProfile> => {
    const data = await apiRequest<{
      user: UserProfile;
      studentProfile: StudentProfile | null;
      authorityProfile: null;
    }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return data.user;
  };

  const submitRegistration = async (
    payload: Record<string, string | RegistrationRole | number>
  ): Promise<{ message: string; accountStatus: 'ACTIVE' }> => {
    const data = await apiRequest<{
      message?: string;
      accountStatus?: string;
      user?: { id?: string; accountStatus?: string };
    }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (
      data.accountStatus !== 'ACTIVE' ||
      data.user?.accountStatus !== 'ACTIVE' ||
      !data.user.id ||
      !data.message
    ) {
      throw new Error('The server did not confirm an ACTIVE account. Try signing in before submitting again.');
    }
    return {
      message: data.message,
      accountStatus: 'ACTIVE',
    };
  };

  const logout = () => {
    setStoredToken(null);
    setUser(null);
    setStudentProfile(null);
    setAuthorityProfile(null);
    setUnreadNotifications(0);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        studentProfile,
        authorityProfile,
        settings,
        unreadNotifications,
        loading,
        login,
        registerStudent,
        submitRegistration,
        logout,
        refreshProfile,
        setUnreadNotifications,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
