import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../lib/store';
import type { UserRole } from '../types';

export function RoleGate(props: { allow: UserRole[]; children: ReactNode; redirectTo?: string }) {
  const profile = useAuthStore((s) => s.profile);

  if (!profile) return null;
  if (!props.allow.includes(profile.role)) {
    return <Navigate to={props.redirectTo || '/'} replace />;
  }
  return <>{props.children}</>;
}

