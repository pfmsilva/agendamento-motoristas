import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { AnalyticsDashboard } from "@/components/dashboards/AnalyticsDashboard";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "Análises · Gestão de Frota" },
      { name: "description", content: "Painéis operacionais configuráveis, KPIs transparentes e densidade horária da frota." },
      { property: "og:title", content: "Análises · Gestão de Frota" },
      { property: "og:description", content: "Painéis operacionais configuráveis, KPIs transparentes e densidade horária da frota." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const { user, loading } = useAuth();

  if (loading || !user) {
    return <p className="p-8 text-sm text-muted-foreground">A carregar as análises…</p>;
  }
  if (user.role !== "owner" && user.role !== "manager") {
    return (
      <div className="panel p-8 text-center">
        <h1 className="text-lg font-semibold">Sem acesso</h1>
        <p className="mt-1 text-sm text-muted-foreground">As análises estão limitadas a proprietários e gestores.</p>
      </div>
    );
  }
  return <AnalyticsDashboard />;
}
