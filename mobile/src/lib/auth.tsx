import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, clearSession, saveSession } from "@/lib/api";
import { getItem } from "@/lib/storage";
import type { Home, Member, User } from "@/lib/types";
import { syncSessionToWatch, unlinkWatch } from "@/lib/wearSync";

type AuthState = {
  ready: boolean;
  user: User | null;
  home: Home | null;
  refresh: () => Promise<Home | null>;
  signIn: (token: string) => Promise<Home | null>;
  signOut: () => Promise<void>;
  setHome: (home: Home | null) => void;
  patchMember: (member: Member) => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [home, setHome] = useState<Home | null>(null);

  const refresh = useCallback(async () => {
    const token = await getItem("token");
    if (!token) {
      setUser(null);
      setHome(null);
      return null;
    }
    const me = await api.me();
    setUser(me.user);
    setHome(me.home);
    syncSessionToWatch().catch(() => {});
    return me.home;
  }, []);

  useEffect(() => {
    refresh()
      .catch(() => {
        setUser(null);
        setHome(null);
      })
      .finally(() => setReady(true));
  }, [refresh]);

  const signIn = useCallback(async (token: string) => {
    await saveSession(token);
    return refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    await clearSession();
    unlinkWatch().catch(() => {});
    setUser(null);
    setHome(null);
  }, []);

  const patchMember = useCallback((member: Member) => {
    setHome((current) => {
      if (!current) return current;
      const members = current.members.some((item) => item.userId === member.userId)
        ? current.members.map((item) => (item.userId === member.userId ? member : item))
        : [...current.members, member];
      const mine = member.userId === user?.id;
      return {
        ...current,
        members,
        protectionArmed: mine ? member.protectionArmed : current.protectionArmed,
      };
    });
  }, [user?.id]);

  const value = useMemo(
    () => ({ ready, user, home, refresh, signIn, signOut, setHome, patchMember }),
    [ready, user, home, refresh, signIn, signOut, patchMember]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("Auth missing");
  return value;
}
