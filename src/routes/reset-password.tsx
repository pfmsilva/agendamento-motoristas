import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { errorMessagePt } from "@/lib/errors";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Definir nova palavra-passe · Gestão de Frota" },
      {
        name: "description",
        content: "Defina uma nova palavra-passe para a sua conta Gestão de Frota através da ligação segura enviada por email.",
      },
      { property: "og:title", content: "Definir nova palavra-passe · Gestão de Frota" },
      {
        property: "og:description",
        content: "Defina uma nova palavra-passe para a sua conta Gestão de Frota através da ligação segura enviada por email.",
      },
    ],
  }),
  component: ResetPasswordPage,
});

type Status = "checking" | "ready" | "invalid" | "done";

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    let settled = false;

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" || (session && !settled)) {
        settled = true;
        setStatus("ready");
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!active || settled) return;
      if (data.session) {
        settled = true;
        setStatus("ready");
        return;
      }
      // Give Supabase a moment to process the recovery link in the URL.
      window.setTimeout(() => {
        if (!active || settled) return;
        settled = true;
        setStatus("invalid");
      }, 2500);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const submit = async () => {
    if (password.length < 8) {
      toast.error("A palavra-passe tem de ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      toast.error("As palavras-passe não coincidem.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error(errorMessagePt(error));
      return;
    }
    setStatus("done");
    await supabase.auth.signOut();
    toast.success("Palavra-passe alterada. Já pode entrar.");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-2 p-6">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <p className="font-display text-lg font-semibold">Gestão de Frota</p>
          <h1 className="mt-2 text-2xl font-semibold">Definir nova palavra-passe</h1>
        </div>

        {status === "checking" && (
          <p className="text-sm text-muted-foreground">A validar a ligação de recuperação…</p>
        )}

        {status === "invalid" && (
          <div className="panel space-y-4 p-4">
            <p className="text-sm text-muted-foreground">
              Esta ligação de recuperação é inválida, já foi utilizada ou expirou. Peça uma nova ligação na página de
              entrada.
            </p>
            <Button className="w-full" onClick={() => navigate({ to: "/", replace: true })}>
              Pedir nova ligação
            </Button>
          </div>
        )}

        {status === "ready" && (
          <div className="panel space-y-3 p-4">
            <div>
              <Label htmlFor="new-password">Nova palavra-passe</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="confirm-password">Confirmar palavra-passe</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">Mínimo de 8 caracteres.</p>
            <Button className="w-full" disabled={busy} onClick={submit}>
              Guardar nova palavra-passe
            </Button>
          </div>
        )}

        {status === "done" && (
          <div className="panel space-y-4 p-4">
            <p className="text-sm text-muted-foreground">
              A palavra-passe foi alterada com sucesso. A ligação de recuperação deixou de ser válida.
            </p>
            <Button className="w-full" onClick={() => navigate({ to: "/", replace: true })}>
              Ir para a entrada
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
