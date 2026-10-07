import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({ userId: z.string().uuid() });

/**
 * Permanently deletes a pending account (an account with no role assigned yet).
 * Owner-only, verified server-side. Accounts that already have a role keep
 * their history and can only be deactivated.
 */
export const deletePendingAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId: callerId } = context;

    const { data: isOwner, error: roleError } = await supabase.rpc("has_role", {
      _user_id: callerId,
      _role: "owner",
    });
    if (roleError) throw new Error(roleError.message);
    if (!isOwner) throw new Error("Apenas o Proprietário pode eliminar pedidos.");

    if (data.userId === callerId) throw new Error("Não pode eliminar a sua própria conta.");

    const { data: roles, error: rolesError } = await supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", data.userId);
    if (rolesError) throw new Error(rolesError.message);
    if (roles && roles.length > 0) {
      throw new Error("Esta conta já tem perfil atribuído; desative-a em vez de a eliminar.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin.from("notifications").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("profiles").delete().eq("id", data.userId);

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (deleteError) throw new Error(deleteError.message);

    return { ok: true as const };
  });

const deleteUserSchema = z.object({ userId: z.string().uuid() });

/**
 * Permanently deletes a user account (with or without a role). Owner-only.
 * Historical records keep their data: references to the user in activities,
 * time off, unavailability, delegations and driver/assistant records are
 * nulled (so the linked driver/assistant record survives as "sem conta"),
 * and profiles/user_roles fall by ON DELETE CASCADE from auth.users.
 */
export const deleteUserAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => deleteUserSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId: callerId } = context;

    const { data: isOwner, error: roleError } = await supabase.rpc("has_role", {
      _user_id: callerId,
      _role: "owner",
    });
    if (roleError) throw new Error(roleError.message);
    if (!isOwner) throw new Error("Apenas o Proprietário pode eliminar utilizadores.");

    if (data.userId === callerId) throw new Error("Não pode eliminar a sua própria conta.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const uid = data.userId;

    // Snapshot for the audit trail, taken BEFORE anything is removed.
    const [{ data: profile }, { data: roles }, { data: driverRec }, { data: assistantRec }] =
      await Promise.all([
        supabaseAdmin.from("profiles").select("name, email").eq("id", uid).maybeSingle(),
        supabaseAdmin.from("user_roles").select("role").eq("user_id", uid),
        supabaseAdmin.from("drivers").select("name").eq("user_id", uid).maybeSingle(),
        supabaseAdmin.from("assistants").select("name").eq("user_id", uid).maybeSingle(),
      ]);

    // Nullify references so history is preserved and the auth user can be deleted.
    const steps: { error: { message: string } | null }[] = await Promise.all([
      supabaseAdmin.from("activities").update({ created_by: null }).eq("created_by", uid),
      supabaseAdmin.from("activities").update({ updated_by: null }).eq("updated_by", uid),
      supabaseAdmin.from("time_off").update({ requested_by: null }).eq("requested_by", uid),
      supabaseAdmin.from("time_off").update({ approved_by: null }).eq("approved_by", uid),
      supabaseAdmin.from("unavailability").update({ created_by: null }).eq("created_by", uid),
      supabaseAdmin.from("assistant_delegations").update({ created_by: null }).eq("created_by", uid),
      supabaseAdmin.from("drivers").update({ user_id: null }).eq("user_id", uid),
      supabaseAdmin.from("assistants").update({ user_id: null }).eq("user_id", uid),
    ]);
    const failed = steps.find((s) => s.error);
    if (failed?.error) throw new Error(failed.error.message);

    await supabaseAdmin.from("notifications").delete().eq("user_id", uid);

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(uid);
    if (deleteError) throw new Error(deleteError.message);

    // Only after a successful deletion: write the audit entry.
    const { error: auditError } = await supabaseAdmin.from("audit_log").insert({
      user_id: callerId,
      action: "user_deleted",
      entity_type: "user",
      entity_id: uid,
      old_value: {
        name: profile?.name ?? null,
        email: profile?.email ?? null,
        role: roles?.[0]?.role ?? null,
        driver_name: driverRec?.name ?? null,
        assistant_name: assistantRec?.name ?? null,
      },
      new_value: null,
    });
    if (auditError) console.error("[audit] user_deleted insert failed:", auditError.message);

    return { ok: true as const };
  });


const deleteRecordSchema = z.object({
  kind: z.enum(["driver", "assistant"]),
  id: z.string().uuid(),
});

/**
 * Deletes a driver/assistant record that is NOT linked to any account and
 * has no service history. Records with history must be deactivated instead.
 * Allowed for owner/manager, matching drivers/assistants write policies.
 */
export const deleteUnlinkedRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => deleteRecordSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId: callerId } = context;

    const { data: allowed, error: roleError } = await supabase.rpc("has_role", {
      _user_id: callerId,
      _role: "owner",
    });
    if (roleError) throw new Error(roleError.message);
    const { data: isManager, error: mgrError } = await supabase.rpc("has_role", {
      _user_id: callerId,
      _role: "manager",
    });
    if (mgrError) throw new Error(mgrError.message);
    if (!allowed && !isManager) {
      throw new Error("Apenas o Proprietário ou um Gestor pode eliminar fichas.");
    }

    const table = data.kind === "driver" ? ("drivers" as const) : ("assistants" as const);

    const { data: rec, error: recError } = await supabase
      .from(table)
      .select("id, user_id, name")
      .eq("id", data.id)
      .maybeSingle();
    if (recError) throw new Error(recError.message);
    if (!rec) throw new Error("A ficha já não existe.");
    if (rec.user_id) throw new Error("Esta ficha está associada a uma conta; elimine a conta de utilizador.");

    if (data.kind === "driver") {
      const { count, error: countError } = await supabase
        .from("activities")
        .select("id", { count: "exact", head: true })
        .eq("driver_id", data.id);
      if (countError) throw new Error(countError.message);
      if ((count ?? 0) > 0) {
        throw new Error("Esta ficha tem serviços no histórico; desative-a em vez de a eliminar.");
      }
    }

    const { error: deleteError } = await supabase.from(table).delete().eq("id", data.id);
    if (deleteError) {
      if (deleteError.code === "23503") {
        throw new Error("Esta ficha tem registos associados; desative-a em vez de a eliminar.");
      }
      throw new Error(deleteError.message);
    }

    // Only after a successful deletion: write the audit entry.
    {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error: auditError } = await supabaseAdmin.from("audit_log").insert({
        user_id: callerId,
        action: `${data.kind}_deleted`,
        entity_type: data.kind,
        entity_id: data.id,
        old_value: { name: rec.name ?? null },
        new_value: null,
      });
      if (auditError) console.error("[audit] record delete insert failed:", auditError.message);
    }



    return { ok: true as const };
  });
