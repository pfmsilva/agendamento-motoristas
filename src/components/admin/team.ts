import type { Database } from "@/integrations/supabase/types";
import type { Assistant, Driver } from "@/lib/scheduling";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type AppRoleValue = Database["public"]["Enums"]["app_role"];

export type TeamPerson = {
  /** stable list key */
  key: string;
  name: string;
  email: string;
  active: boolean;
  role: AppRoleValue | null;
  profile: Profile | null;
  driver: Driver | null;
  assistant: Assistant | null;
};

export const ROLE_LABEL: Record<AppRoleValue, string> = {
  owner: "Proprietário",
  manager: "Gestor",
  administrator: "Administrador",
  assistant: "Assistente",
  driver: "Motorista",
};

/**
 * Single source of truth for the team list: every account, plus legacy
 * driver/assistant records that are not linked to any account yet.
 */
export function buildTeam(
  profiles: Profile[],
  roles: { user_id: string; role: string }[],
  drivers: Driver[],
  assistants: Assistant[],
): TeamPerson[] {
  const roleOf = new Map<string, AppRoleValue>();
  for (const r of roles) roleOf.set(r.user_id, r.role as AppRoleValue);

  const driverOf = new Map<string, Driver>();
  for (const d of drivers) if (d.user_id) driverOf.set(d.user_id, d);
  const assistantOf = new Map<string, Assistant>();
  for (const a of assistants) if (a.user_id) assistantOf.set(a.user_id, a);

  const people: TeamPerson[] = profiles.map((p) => ({
    key: p.id,
    name: p.name || p.email,
    email: p.email,
    active: p.active,
    role: roleOf.get(p.id) ?? null,
    profile: p,
    driver: driverOf.get(p.id) ?? null,
    assistant: assistantOf.get(p.id) ?? null,
  }));

  for (const d of drivers) {
    if (d.user_id) continue;
    people.push({
      key: `driver:${d.id}`,
      name: d.name,
      email: "",
      active: d.active,
      role: null,
      profile: null,
      driver: d,
      assistant: null,
    });
  }
  for (const a of assistants) {
    if (a.user_id) continue;
    people.push({
      key: `assistant:${a.id}`,
      name: a.name,
      email: "",
      active: a.active,
      role: null,
      profile: null,
      driver: null,
      assistant: a,
    });
  }

  return people.sort((x, y) => x.name.localeCompare(y.name, "pt-PT"));
}
