import {
  createContext,
  useContext,
  useEffect,
  type ReactNode,
} from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';

import { apiGet, apiSend, setCsrfToken } from '../api/client';
import { endpoints } from '../api/endpoints';

export interface AuthUser {
  login: string;
  role: 'admin' | 'user';
  mustChangePassword: boolean;
  csrfToken?: string | null;
}

export interface AuthCredentials {
  login: string;
  password: string;
  rememberMe?: boolean;
}

export interface PasswordChangeRequest {
  currentPassword: string;
  newPassword: string;
}

export const AUTH_ME_QUERY_KEY: readonly ['auth', 'me'] = ['auth', 'me'];

interface AuthContextValue {
  user: AuthUser | null;
  isPending: boolean;
  error: Error | null;
  login: UseMutationResult<AuthUser, Error, AuthCredentials>;
  signup: UseMutationResult<AuthUser, Error, AuthCredentials>;
  changePassword: UseMutationResult<AuthUser, Error, PasswordChangeRequest>;
  logout: UseMutationResult<unknown, Error, void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const queryClient = useQueryClient();
  const me = useQuery({
    queryKey: AUTH_ME_QUERY_KEY,
    queryFn: ({ signal }) => apiGet<AuthUser>(endpoints.authMe(), { signal }),
    retry: false,
    staleTime: 30_000,
  });
  const finish = (user: AuthUser): void => {
    setCsrfToken(user.csrfToken);
    queryClient.setQueryData(AUTH_ME_QUERY_KEY, user);
    queryClient.invalidateQueries({ queryKey: ['repos'] });
  };
  const login = useMutation({
    mutationFn: (body: AuthCredentials) =>
      apiSend<AuthUser>(endpoints.authLogin(), body),
    onSuccess: finish,
  });
  const signup = useMutation({
    mutationFn: (body: AuthCredentials) =>
      apiSend<AuthUser>(endpoints.authSignup(), body),
    onSuccess: finish,
  });
  const changePassword = useMutation({
    mutationFn: (body: PasswordChangeRequest) =>
      apiSend<AuthUser>(endpoints.authPassword(), body),
    onSuccess: (user) => {
      const previous = queryClient.getQueryData<AuthUser>(AUTH_ME_QUERY_KEY);
      finish({ ...user, csrfToken: user.csrfToken ?? previous?.csrfToken ?? null });
    },
  });
  const logout = useMutation({
    mutationFn: () => apiSend(endpoints.authLogout(), {}),
    onSuccess: async () => {
      // Stop earlier account reads before publishing the signed-out state.
      await queryClient.cancelQueries();
      setCsrfToken(null);
      // Keep the observed account query: removing it starts another account
      // read and loses the explicit signed-out result.
      queryClient.removeQueries({
        predicate: ({ queryKey }) =>
          !(queryKey.length === 2 && queryKey[0] === 'auth' && queryKey[1] === 'me'),
      });
      queryClient.getMutationCache().clear();
      queryClient.setQueryData(AUTH_ME_QUERY_KEY, null);
    },
  });
  useEffect(() => {
    setCsrfToken(me.data?.csrfToken);
  }, [me.data?.csrfToken]);

  return (
    <AuthContext.Provider
      value={{
        user: me.data ?? null,
        isPending: me.isPending,
        error: me.error,
        login,
        signup,
        changePassword,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return value;
}
