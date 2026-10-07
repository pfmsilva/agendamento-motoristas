import { createFileRoute, redirect } from "@tanstack/react-router";

// A autenticação passou a ser a página inicial; mantemos /auth apenas como reencaminhamento.
export const Route = createFileRoute("/auth")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true });
  },
  component: () => null,
});
