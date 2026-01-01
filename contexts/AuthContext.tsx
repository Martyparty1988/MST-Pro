
import React, { createContext, useState, useContext, useEffect } from 'react';
import {
  onAuthStateChanged,
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { firebaseService } from '../services/firebaseService';
import { db } from '../services/db';
import type { User } from '../types';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  currentUser: User | null; // Compatibility with existing code
  logout: () => Promise<void>;
  // For legacy support while transitioning
  login: (user: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!firebaseService.isReady) {
      // If service not ready yet, check local storage for immediate UI feedback?
      // Actually, better to wait for Firebase.
      const timer = setTimeout(() => {
        if (isLoading) setIsLoading(false);
      }, 2000);
      return () => clearTimeout(timer);
    }

    const unsubscribe = onAuthStateChanged(firebaseService.getAuth, async (firebaseUser) => {
      setIsLoading(true);
      if (firebaseUser) {
        // Find matching worker in Dexie/Local DB to get role and workerId
        // Try searching by email or username (simulated as email for now)
        const email = firebaseUser.email;
        let worker = await db.workers.where('username').equals(email?.split('@')[0] || '').first();

        // Explicit Admin Overrides
        if (email === 'mullerpve@gmail.com' || email === 'mullerpvev@gmail.com' || (!worker && (email === 'admin@mst.app' || email?.startsWith('admin')))) {
          const adminUser: User = {
            username: worker?.name || 'Admin',
            role: 'admin',
            workerId: worker?.id
          };
          setUser(adminUser);
          localStorage.setItem('user', JSON.stringify(adminUser));
        } else if (worker) {
          const userData: User = {
            username: worker.name,
            role: (worker as any).role || 'user',
            workerId: worker.id
          };
          setUser(userData);
          localStorage.setItem('user', JSON.stringify(userData));
        } else {
          // Auth exists but no worker found - might be a new registration
          setUser({ username: firebaseUser.displayName || firebaseUser.email || 'User', role: 'user' });
        }
      } else {
        setUser(null);
        localStorage.removeItem('user');
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    await signOut(firebaseService.getAuth);
    setUser(null);
    localStorage.removeItem('user');
  };

  // Legacy login for manual state setting (if needed)
  const login = (userData: User) => {
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
  };

  return (
    <AuthContext.Provider value={{
      isAuthenticated: !!user,
      isLoading,
      user,
      currentUser: user,
      login,
      logout
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
