import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { startOfDay } from "date-fns";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Plus, Settings2 } from "lucide-react";
import { LoanVehicleCalendar, type LoanView } from "@/components/loan/LoanVehicleCalendar";
import { LoanEventDialog, type LoanEventDraft } from "@/components/loan/LoanEventDialog";
import { FindVehicleDialog } from "@/components/loan/FindVehicleDialog";
import { ManageVehiclesDialog } from "@/components/loan/ManageVehiclesDialog";
import { DayDetailDialog } from "@/components/loan/DayDetailDialog";
import {
  minutesOnDay,
  useLoanEvents,
  useLoanEventTypes,
  useLoanVehicles,
  type LoanEvent,
} from "@/lib/loan-vehicles";
import { downloadLoanVehiclesExcel } from "@/lib/loan-vehicles-export";
import { useProfiles } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/vehicles")({
  head: () => ({
    meta: [
      { title: "Viaturas de Empréstimo · Gestão de Frota" },
      {
        name: "description",
        content: "Calendário dedicado às viaturas de empréstimo: alocações, inspeções e ocupação diária.",
      },
      { property: "og:title", content: "Viaturas de Empréstimo · Gestão de Frota" },
      {
        property: "og:description",
        content: "Calendário dedicado às viaturas de empréstimo: alocações, inspeções e ocupação diária.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoanVehiclesPage,
});

const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

function LoanVehiclesPage() {
  const { user, loading } = useAuth();
  const { data: vehicles = [] } = useLoanVehicles();
  const { data: events = [] } = useLoanEvents();
  const { data: eventTypes = [] } = useLoanEventTypes();
  const { data: profiles = [] } = useProfiles();

  const [view, setView] = useState<LoanView>("day");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<LoanEventDraft | null>(null);
  const [editing, setEditing] = useState<LoanEvent | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [dayDetail, setDayDetail] = useState<{ vehicleId: string; day: Date } | null>(null);

  const visibleVehicles = useMemo(() => vehicles.filter((v) => v.active), [vehicles]);

  const detailVehicle = vehicles.find((v) => v.id === dayDetail?.vehicleId) ?? null;
  const detailEvents = useMemo(() => {
    if (!dayDetail) return [];
    return events.filter(
      (e) => !e.cancelled && e.vehicle_id === dayDetail.vehicleId && minutesOnDay(e, dayDetail.day) > 0,
    );
  }, [events, dayDetail]);

  if (loading || !user) {
    return <p className="p-8 text-sm text-muted-foreground">A carregar…</p>;
  }
  if (user.role !== "owner" && user.role !== "manager") {
    return (
      <div className="panel p-8 text-center">
        <h1 className="text-lg font-semibold">Sem acesso</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          As viaturas de empréstimo estão limitadas a proprietários e gestores.
        </p>
      </div>
    );
  }

  const openNew = (d: LoanEventDraft) => {
    setEditing(null);
    setDraft(d);
    setFormOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:flex-wrap">
        <h1 className="font-display text-2xl font-semibold">Viaturas de Empréstimo</h1>
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
          <Button onClick={() => setFindOpen(true)}>Encontrar viatura disponível</Button>
          <Button variant="outline" onClick={() => openNew({ kind: "allocation" })}>
            <Plus className="size-4" />Novo
          </Button>
          <Button variant="outline" onClick={() => setManageOpen(true)}>
            <Settings2 className="size-4" />
            Gerir viaturas
          </Button>
        </div>
      </div>

      {visibleVehicles.length === 0 ? (
        <div className="panel p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Ainda não há viaturas ativas. Comece por adicionar viaturas em «Gerir viaturas».
          </p>
        </div>
      ) : (
        <LoanVehicleCalendar
          view={view}
          onViewChange={setView}
          anchor={anchor}
          onAnchorChange={setAnchor}
          vehicles={visibleVehicles}
          events={events}
          eventTypes={eventTypes}
          onExport={(filteredEvents, period) => void downloadLoanVehiclesExcel(filteredEvents, vehicles, eventTypes, Object.fromEntries(profiles.map((profile) => [profile.id, profile.name])), period)}
          onOpenEvent={(e) => {
            setDraft(null);
            setEditing(e);
            setFormOpen(true);
          }}
          onEmptyCell={(vehicleId, date, cellView) => {
            if (cellView === "day") {
              const end = new Date(date);
              end.setHours(end.getHours() + 1);
              openNew({
                kind: "allocation",
                vehicleId,
                date: isoDate(date),
                startTime: hhmm(date),
                endTime: hhmm(end),
              });
              return;
            }
            setDayDetail({ vehicleId, day: startOfDay(date) });
          }}
          onDayDetail={(vehicleId, date) => setDayDetail({ vehicleId, day: startOfDay(date) })}
        />
      )}

      <LoanEventDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        vehicles={vehicles}
        events={events}
        draft={draft}
        editing={editing}
        eventTypes={eventTypes}
      />

      <FindVehicleDialog
        open={findOpen}
        onOpenChange={setFindOpen}
        vehicles={vehicles}
        events={events}
        onChoose={(vehicleId, startDate, startTime, endDate, endTime) => {
          setFindOpen(false);
          setEditing(null);
          setDraft({ kind: "allocation", vehicleId, date: startDate, endDate, startTime, endTime });
          setFormOpen(true);
        }}
      />

      <ManageVehiclesDialog open={manageOpen} onOpenChange={setManageOpen} vehicles={vehicles} />

      <DayDetailDialog
        open={!!dayDetail}
        onOpenChange={(o) => !o && setDayDetail(null)}
        vehicle={detailVehicle}
        day={dayDetail?.day ?? null}
        events={detailEvents}
        eventTypes={eventTypes}
        onOpenEvent={(e) => {
          setDayDetail(null);
          setDraft(null);
          setEditing(e);
          setFormOpen(true);
        }}
        onCreate={(kind) => {
          if (!dayDetail) return;
          const day = dayDetail.day;
          const vehicleId = dayDetail.vehicleId;
          setDayDetail(null);
          openNew({
            kind,
            vehicleId,
            date: isoDate(day),
            startTime: eventTypes.find((type) => type.key === kind)?.default_start_time.slice(0, 5) ?? "09:00",
            endTime: eventTypes.find((type) => type.key === kind)?.default_end_time.slice(0, 5) ?? "18:00",
          });
        }}
      />
    </div>
  );
}
