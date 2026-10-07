import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "owner" | "manager" | "assistant" | "driver" | "administrator";

export type AppUser = {
  userId: string;
  email: string;
  name: string;
  role: AppRole | null;
  driverId: string | null;
  /** Permissão interna do motorista para criar serviços/eventos na sua agenda. */
  driverCanCreateEvents: boolean;
  assistantId: string | null;
  administratorId: string | null;
};

type Ctx = {
  session: Session | null;
  user: AppUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<Ctx>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
});

async function loadUser(session: Session): Promise<AppUser> {
  const uid = session.user.id;
  const [roleRes, driverRes, assistantRes, administratorRes, profileRes] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", uid).limit(1).maybeSingle(),
    supabase.from("drivers").select("id, can_create_events").eq("user_id", uid).maybeSingle(),
    supabase.from("assistants").select("id").eq("user_id", uid).maybeSingle(),
    supabase.from("administrators").select("id").eq("user_id", uid).maybeSingle(),
    supabase.from("profiles").select("name").eq("id", uid).maybeSingle(),
  ]);
  return {
    userId: uid,
    email: session.user.email ?? "",
    name: profileRes.data?.name || session.user.email || "User",
    role: (roleRes.data?.role as AppRole | undefined) ?? null,
    driverId: driverRes.data?.id ?? null,
    driverCanCreateEvents: driverRes.data?.can_create_events ?? true,
    assistantId: assistantRes.data?.id ?? null,
    administratorId: administratorRes.data?.id ?? null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    let active = true;

    const apply = (s: Session | null) => {
      if (!active) return;
      setSession(s);
      if (!s) {
        setUser(null);
        setLoading(false);
        return;
      }
      loadUser(s)
        .then((u) => {
          if (active) setUser(u);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    };

    supabase.auth.getSession().then(({ data }) => apply(data.session));

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        apply(s);
        if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
      } else if (event === "INITIAL_SESSION") {
        apply(s);
      } else {
        setSession(s);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [queryClient]);

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, signOut }}>{children}</AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
