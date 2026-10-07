import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Bell, Check, LogOut, Menu, WifiOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth";
import { canSeePendingAssignments } from "@/lib/scheduling";
import {
  useDismissNotifications,
  useMarkNotificationsRead,
  useNotifications,
  usePendingCitiesCount,
  useRealtimeSync,
} from "@/lib/data";
import { useState, type ReactNode } from "react";

function NotificationBell() {
  const { data: all = [] } = useNotifications();
  const navigate = useNavigate();
  const { user } = useAuth();

  const markRead = useMarkNotificationsRead();
  const dismiss = useDismissNotifications();
  // Atribuições manuais pendentes só dizem respeito a Gestor e Proprietário.
  // Atribuições pendentes e validações de alterações só dizem respeito a Gestor e Proprietário.
  const items = canSeePendingAssignments(user?.role)
    ? all
    : all.filter((n) => n.kind !== "assignment_pending" && n.kind !== "change_validation");
  const unread = items.filter((n) => !n.read);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notificações">
          <Bell className="size-5" />
          {unread.length > 0 && (
            <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground">
              {unread.length > 9 ? "9+" : unread.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
          <span className="text-sm font-semibold">Notificações</span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={!unread.length || markRead.isPending}
              onClick={() => markRead.mutate(unread.map((n) => n.id))}
            >
              <Check className="size-3" /> Marcar lidas
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={!items.length || dismiss.isPending}
              onClick={() => dismiss.mutate(items.map((n) => n.id))}
            >
              Limpar
            </Button>
          </div>
        </div>
        <ScrollArea className="h-80">
          {items.length === 0 && <p className="p-4 text-sm text-muted-foreground">Ainda não há nada.</p>}
          {items.map((n) => {
            // Notificações ligadas a um serviço abrem o próprio evento pelo seu id.
            const activityId = n.entity_type === "activity" ? n.entity_id : null;
            const openActivity = () => {
              if (!activityId) return;
              if (!n.read) markRead.mutate([n.id]);
              void navigate({ to: "/app", search: { activity: activityId } });
            };
            return (
            <div key={n.id} className="border-b px-4 py-3 last:border-0">
              <div className="flex items-start gap-2">
                {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
                <div
                  className={`min-w-0 flex-1 rounded-md px-1 py-0.5 text-left ${
                    activityId ? "cursor-pointer transition-colors hover:bg-muted/60" : ""
                  }`}
                  {...(activityId
                    ? {
                        role: "button" as const,
                        tabIndex: 0,
                        onClick: openActivity,
                        onKeyDown: (e: React.KeyboardEvent) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openActivity();
                          }
                        },
                      }
                    : {})}
                >
                  <p className="text-sm font-medium break-words">{n.title}</p>
                  <p className="whitespace-pre-line break-words text-xs leading-relaxed text-muted-foreground">
                    {n.body}
                  </p>


                  {n.entity_type === "city" && (
                    <button
                      type="button"
                      className="mt-1 text-xs font-medium text-primary underline underline-offset-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!n.read) markRead.mutate([n.id]);
                        void navigate({ to: "/admin", search: { tab: "cities" } });
                      }}
                    >
                      Configurar tempo de deslocação
                    </button>
                  )}
                  {n.kind === "assignment_pending" && (
                    <button
                      type="button"
                      className="mt-1 text-xs font-medium text-primary underline underline-offset-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!n.read) markRead.mutate([n.id]);
                        void navigate({ to: "/app", search: { activity: undefined } });
                      }}
                    >
                      Atribuir motorista
                    </button>
                  )}
                  {/* Férias / Ausência: informação apenas — «OK» só dispensa a notificação. */}
                  {n.kind === "time_off" && (
                    <button
                      type="button"
                      className="mt-1 text-xs font-medium text-primary underline underline-offset-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!n.read) markRead.mutate([n.id]);
                        dismiss.mutate([n.id]);
                      }}
                    >
                      OK
                    </button>
                  )}
                  {n.kind === "change_validation" && (
                    <button
                      type="button"
                      className="mt-1 text-xs font-medium text-primary underline underline-offset-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!n.read) markRead.mutate([n.id]);
                        void navigate({ to: "/app", search: { activity: undefined } });
                      }}
                    >
                      Ver validação
                    </button>
                  )}

                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {new Date(n.created_at).toLocaleString("pt-PT")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {!n.read && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      aria-label="Marcar como lida"
                      onClick={() => markRead.mutate([n.id])}
                    >
                      <Check className="size-3" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    aria-label="Remover notificação"
                    onClick={() => dismiss.mutate([n.id])}
                  >
                    <X className="size-3" />
                  </Button>
                </div>
              </div>
            </div>
            );
          })}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

/** Ponto de aviso: cidades novas ainda sem tempo de deslocação configurado.
 *  Posicionado no canto superior direito da caixa pai (que deve ter `relative`),
 *  sem alterar o alinhamento do texto. */
export function PendingCitiesDot({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      title="Cidades por configurar"
      aria-label="Cidades por configurar"
      className="pointer-events-none absolute right-1.5 top-1.5 size-2 rounded-full bg-leave"
    />
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  // Keeps every open session in sync with changes made by other users.
  const { live } = useRealtimeSync();
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [menuOpen, setMenuOpen] = useState(false);
  const pendingCities = usePendingCitiesCount();


  // Accounts without a profile assigned by the owner get no navigation at all.
  const pendingApproval = !loading && !!user && !user.role;





  const navClass = (active: boolean) =>
    `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
      active
        ? "bg-sidebar-accent text-sidebar-accent-foreground"
        : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
    }`;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex h-16 max-w-[1800px] items-center gap-3 px-4 sm:gap-6 sm:px-6">
          {!pendingApproval && (
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="sm:hidden" aria-label="Abrir menu">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <div className="border-b px-4 py-4">
                  <p className="text-sm font-semibold">{user?.name}</p>
                  <p className="break-all text-xs text-muted-foreground">{user?.email}</p>
                </div>
                <nav className="flex flex-col gap-1 p-3">
                  <Link to="/app" search={{ activity: undefined }} className={navClass(path === "/app")} onClick={() => setMenuOpen(false)}>
                    Agenda
                  </Link>
                  {(user?.role === "manager" || user?.role === "owner") && (
                    <>
                      <Link
                        to="/vehicles"
                        className={navClass(path === "/vehicles")}
                        onClick={() => setMenuOpen(false)}
                      >
                        Viaturas de Empréstimo
                      </Link>
                      <Link
                        to="/analytics"
                        className={navClass(path === "/analytics")}
                        onClick={() => setMenuOpen(false)}
                      >
                        Análises
                      </Link>
                      <Link
                        to="/admin"
                        className={`${navClass(path === "/admin")} relative ${pendingCities > 0 ? "pr-5" : ""}`}
                        onClick={() => setMenuOpen(false)}
                      >
                        Administração
                        <PendingCitiesDot count={pendingCities} />
                      </Link>
                    </>
                  )}
                  {user?.role === "owner" && (
                    <Link
                      to="/rules"
                      className={navClass(path === "/rules")}
                      onClick={() => setMenuOpen(false)}
                    >
                      Regras e Automação
                    </Link>
                  )}
                </nav>
                {!live && (
                  <p className="flex items-center gap-1.5 px-4 text-xs text-muted-foreground">
                    <WifiOff className="size-3" />
                    Sem atualização automática
                  </p>
                )}
              </SheetContent>
            </Sheet>
          )}
          <nav className="ml-2 hidden min-w-0 shrink items-center gap-1 overflow-x-auto sm:flex">
            {!pendingApproval && (
              <Link to="/app" search={{ activity: undefined }} className={navClass(path === "/app")}>
                Agenda
              </Link>
            )}

            {(user?.role === "manager" || user?.role === "owner") && (
              <>
                <Link to="/vehicles" className={navClass(path === "/vehicles")}>
                  Viaturas de Empréstimo
                </Link>
                <Link to="/analytics" className={navClass(path === "/analytics")}>
                  Análises
                </Link>
                <Link
                  to="/admin"
                  className={`${navClass(path === "/admin")} relative ${pendingCities > 0 ? "pr-5" : ""}`}
                >
                  Administração
                  <PendingCitiesDot count={pendingCities} />
                </Link>
              </>
            )}
            {user?.role === "owner" && (
              <Link to="/rules" className={navClass(path === "/rules")}>
                Regras e Automação
              </Link>
            )}
          </nav>
          {/* Icon buttons render their 16px glyph 10px inside the 36px box.
              The pr-2.5 on the user block adds the same inset to the text side,
              so visible spacing name → bell → logout is equal (inset + gap + inset). */}
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            {!live && (
              <span
                className="hidden items-center gap-1.5 rounded-md border border-border/70 px-2 py-1 text-xs text-muted-foreground sm:inline-flex"
                title="A ligação em tempo real está em baixo. Os dados são atualizados ao voltar a ligar."
              >
                <WifiOff className="size-3" />
                Sem atualização automática
              </span>
            )}

            <div className="hidden pr-2.5 text-right md:block">
              <p className="text-xs font-semibold leading-tight">{user?.name}</p>
              <p className="text-[11px] leading-tight text-muted-foreground">{user?.email}</p>
            </div>
            <NotificationBell />

            <Button
              variant="ghost"
              size="icon"
              aria-label="Terminar sessão"
              onClick={async () => {
                await signOut();
                navigate({ to: "/", replace: true });
              }}
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1800px] px-4 py-6 sm:px-6 sm:py-8">
        {pendingApproval ? (
          <div className="panel mx-auto max-w-lg p-8 text-center">
            <h1 className="font-display text-xl font-semibold">Conta pendente de aprovação</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              A sua conta foi criada, mas ainda não tem perfil atribuído. O proprietário da aplicação foi notificado e
              irá definir as suas permissões.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Assim que o perfil for atribuído, volte a entrar para aceder à aplicação.
            </p>
          </div>
        ) : (
          children
        )}
      </main>

    </div>
  );
}
