import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { ManagerDashboard } from "@/components/dashboards/ManagerDashboard";
import { AssistantDashboard } from "@/components/dashboards/AssistantDashboard";
import { DriverDashboard } from "@/components/dashboards/DriverDashboard";


export const Route = createFileRoute("/_authenticated/app")({
  // As notificações de serviço abrem o evento através de /app?activity=<id>.
  validateSearch: (search: { activity?: string }) => ({
    activity: typeof search.activity === "string" ? search.activity : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Agenda · Gestão de Frota" },
      { name: "description", content: "Agenda, disponibilidade e atribuições dos motoristas em tempo real." },
      { property: "og:title", content: "Agenda · Gestão de Frota" },
      { property: "og:description", content: "Agenda, disponibilidade e atribuições dos motoristas em tempo real." },
    ],
  }),
  component: SchedulePage,
});

function SchedulePage() {
  const { user, loading } = useAuth();

  if (loading || !user) {
    return <p className="p-8 text-sm text-muted-foreground">A carregar a sua área de trabalho…</p>;
  }
  if (user.role === "owner") return <ManagerDashboard />;
  if (user.role === "manager") return <ManagerDashboard />;
  if (user.role === "administrator") return <AssistantDashboard />;
  if (user.role === "assistant") return <AssistantDashboard />;
  if (user.role === "driver") return <DriverDashboard />;
  return (
    <div className="panel p-8 text-center">
      <h1 className="text-lg font-semibold">Sem perfil atribuído</h1>
      <p className="mt-1 text-sm text-muted-foreground">Peça ao seu gestor para lhe atribuir um perfil.</p>
    </div>
  );
}
