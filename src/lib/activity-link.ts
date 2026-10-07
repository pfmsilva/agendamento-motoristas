import { useEffect, useRef } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { toast } from "sonner";
import { fetchActivityById } from "@/lib/data";
import type { Activity } from "@/lib/scheduling";

/**
 * Abertura de um serviço a partir de uma notificação.
 *
 * A notificação navega para `/app?activity=<id>`; cada painel usa este hook
 * para reaproveitar o seu próprio calendário e diálogo. Só o serviço indicado
 * é pedido — nunca o histórico completo.
 */
export function useActivityFromSearch(onOpen: (activity: Activity) => void) {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { activity?: string };
  const handled = useRef<string | null>(null);
  const openRef = useRef(onOpen);
  openRef.current = onOpen;

  useEffect(() => {
    const id = search.activity;
    if (!id || handled.current === id) return;
    handled.current = id;
    void navigate({ to: "/app", search: { activity: undefined }, replace: true });
    fetchActivityById(id)
      .then((activity) => {
        if (!activity) toast.error("Este serviço já não está disponível.");
        else openRef.current(activity);
      })
      .catch(() => toast.error("Este serviço já não está disponível."));
  }, [search.activity, navigate]);
}
