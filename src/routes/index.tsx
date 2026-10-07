import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { CarFront as FleetIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { errorMessagePt } from "@/lib/errors";

export const Route = createFileRoute("/")({
  // A app é totalmente autenticada: sem SSR evita-se o conflito de hidratação
  // quando o router redireciona /app -> / durante o arranque (ecrã em branco).
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar · Gestão de Frota" },
      { name: "description", content: "Entre para gerir motoristas, escalas, férias e atribuições." },
      { property: "og:title", content: "Entrar · Gestão de Frota" },
      { property: "og:description", content: "Entre para gerir motoristas, escalas, férias e atribuições." },
    ],
  }),
  component: AuthPage,
});

const DEMO_PASSWORD = "demo1234";
const DEMO: { label: string; email: string; password?: string }[] = [
  { label: "Proprietário", email: "owner@demo.com" },
  { label: "Gestor", email: "manager@demo.com" },
  { label: "Administrador A", email: "admin.demo@example.com" },
  { label: "Administrador B", email: "admin.b@demo.com", password: "FrotaAdminB#2026" },
  { label: "Assistente A", email: "assistant.a@demo.com" },
  { label: "Assistente B", email: "assistant.b@demo.com" },
  { label: "Assistente C", email: "assistant.c@demo.com" },
  { label: "Motorista A", email: "driver.a@demo.com" },
  { label: "Motorista B", email: "driver.b@demo.com" },
  { label: "Motorista C", email: "driver.c@demo.com" },
];

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("manager@demo.com");
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [name, setName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupDone, setSignupDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoverySent, setRecoverySent] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app", search: { activity: undefined }, replace: true });
    });
  }, [navigate]);

  const requestRecovery = async () => {
    const target = recoveryEmail.trim();
    if (!target) {
      toast.error("Introduza o email da sua conta.");
      return;
    }
    setBusy(true);
    await supabase.auth.resetPasswordForEmail(target, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    // Resposta neutra: nunca revelar se o email está registado.
    setRecoverySent(true);
    toast.success("Se existir uma conta com esse email, enviámos as instruções para repor a palavra-passe.");
  };

  const signIn = async (mail = email, pass = password) => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: mail, password: pass });
    setBusy(false);
    if (error) {
      toast.error(errorMessagePt(error));
      return;
    }
    navigate({ to: "/app", search: { activity: undefined }, replace: true });
  };

  const signUp = async () => {
    const cleanName = name.trim();
    const cleanEmail = signupEmail.trim();
    if (!cleanName) {
      toast.error("Introduza o seu nome completo.");
      return;
    }
    if (!cleanEmail) {
      toast.error("Introduza o email da conta.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
      toast.error("O email introduzido não é válido.");
      return;
    }
    if (signupPassword.length < 8) {
      toast.error("A palavra-passe tem de ter pelo menos 8 caracteres.");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password: signupPassword,
      options: { data: { name: cleanName }, emailRedirectTo: `${window.location.origin}/app` },
    });
    setBusy(false);
    if (error) {
      // Mantém o erro técnico nos logs para debugging; ao utilizador só chega a mensagem PT-PT.
      console.error("[signUp]", error);
      toast.error(errorMessagePt(error));
      return;
    }
    setSignupDone(true);
    const usedPassword = signupPassword;
    setSignupPassword("");
    if (!data.session) {
      // Fallback silencioso: entra de imediato caso o registo não devolva sessão.
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: usedPassword,
      });
      if (signInError) {
        console.error("[signUp:autoSignIn]", signInError);
        toast.error(errorMessagePt(signInError));
        return;
      }
    }
    toast.success("Conta criada. A aguardar atribuição de perfil pelo Proprietário.");
    navigate({ to: "/app", search: { activity: undefined }, replace: true });
  };

  const google = async () => {
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) {
      toast.error("Falha ao entrar com o Google");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/app", search: { activity: undefined }, replace: true });
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-5">
          <div className="flex items-center gap-2.5 text-primary" aria-hidden="true">
            <FleetIcon className="h-5 w-5" strokeWidth={1.75} />
            <span className="text-xs font-semibold uppercase tracking-[0.2em]">Gestão de Frota</span>
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Bem-vindo de volta</h1>
            <p className="text-sm text-muted-foreground">Entre na sua área de agendamento.</p>
          </div>
        </div>

        <Tabs defaultValue="signin">
          <TabsList className="w-full">
            <TabsTrigger value="signin" className="flex-1">Entrar</TabsTrigger>
            <TabsTrigger value="signup" className="flex-1">Criar conta</TabsTrigger>
          </TabsList>

          <TabsContent value="signin" className="mt-4 space-y-3">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="password">Palavra-passe</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                onClick={() => {
                  setRecoveryEmail(email);
                  setRecoverySent(false);
                  setRecovering((v) => !v);
                }}
              >
                Esqueci-me da palavra-passe
              </button>
            </div>
            {recovering && (
              <div className="panel space-y-3 p-4">
                {recoverySent ? (
                  <p className="text-sm text-muted-foreground">
                    Se existir uma conta com esse email, enviámos as instruções para repor a palavra-passe. Verifique
                    também a pasta de spam.
                  </p>
                ) : (
                  <>
                    <div>
                      <Label htmlFor="recovery-email">Email da conta</Label>
                      <Input
                        id="recovery-email"
                        type="email"
                        autoComplete="email"
                        value={recoveryEmail}
                        onChange={(e) => setRecoveryEmail(e.target.value)}
                      />
                    </div>
                    <Button variant="secondary" className="w-full" disabled={busy} onClick={requestRecovery}>
                      Enviar instruções de recuperação
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Receberá uma ligação segura, válida por tempo limitado e de uso único.
                    </p>
                  </>
                )}
              </div>
            )}
            <Button className="w-full" disabled={busy} onClick={() => signIn()}>
              Entrar
            </Button>
          </TabsContent>

          <TabsContent value="signup" className="mt-4 space-y-3">
            <div>
              <Label htmlFor="name">Nome completo</Label>
              <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="email2">Email</Label>
              <Input
                id="email2"
                type="email"
                autoComplete="email"
                value={signupEmail}
                onChange={(e) => setSignupEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="password2">Palavra-passe</Label>
              <Input
                id="password2"
                type="password"
                autoComplete="new-password"
                value={signupPassword}
                onChange={(e) => setSignupPassword(e.target.value)}
              />
            </div>
            <Button className="w-full" disabled={busy} onClick={signUp}>
              Criar conta
            </Button>
            {signupDone && (
              <p className="text-xs text-muted-foreground">
                Conta criada. O acesso às funcionalidades fica disponível depois de o Proprietário atribuir um perfil.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Escolha uma palavra-passe segura, com pelo menos 8 caracteres e que não use em nenhum outro site.
            </p>
          </TabsContent>
        </Tabs>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> ou <span className="h-px flex-1 bg-border" />
        </div>
        <Button variant="outline" className="w-full" onClick={google}>
          Continuar com o Google
        </Button>

        <div className="panel p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contas de demonstração</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {DEMO.map((d) => (
              <Button
                key={d.email}
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  const pass = d.password ?? DEMO_PASSWORD;
                  setEmail(d.email);
                  setPassword(pass);
                  void signIn(d.email, pass);
                }}
              >
                {d.label}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
