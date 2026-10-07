import { useEffect, useState } from "react";
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const navigate = useNavigate();
  // O estado de sessão é verificado após a hidratação: redirecionar durante o
  // arranque do router trocava a árvore a meio da hidratação e deixava o ecrã em branco.
  const [status, setStatus] = useState<"loading" | "authed">("loading");

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      if (error || !data.user) {
        navigate({ to: "/", replace: true });
        return;
      }
      setStatus("authed");
    });
    return () => {
      active = false;
    };
  }, [navigate]);

  if (status === "loading") return null;

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
