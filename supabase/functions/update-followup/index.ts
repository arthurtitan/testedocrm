import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { contact_id, chatwoot_conversation_id, account_id, action, move_to_stage_slug } = body;

    // Validate: need either contact_id or chatwoot_conversation_id
    if (!contact_id && !chatwoot_conversation_id) {
      return new Response(
        JSON.stringify({ error: "contact_id ou chatwoot_conversation_id é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!account_id) {
      return new Response(
        JSON.stringify({ error: "account_id é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find contact
    let contactQuery = supabase
      .from("contacts")
      .select("id, followup_count, last_followup_at, nome")
      .eq("account_id", account_id);

    if (contact_id) {
      contactQuery = contactQuery.eq("id", contact_id);
    } else {
      contactQuery = contactQuery.eq("chatwoot_conversation_id", chatwoot_conversation_id);
    }

    const { data: contact, error: findError } = await contactQuery.single();

    if (findError || !contact) {
      return new Response(
        JSON.stringify({ error: "Contato não encontrado", details: findError?.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action: increment (default), reset, or set
    let updates: Record<string, any> = {};

    if (action === "reset") {
      updates = { followup_count: 0, last_followup_at: null };
    } else if (action === "set" && body.followup_count !== undefined) {
      updates = {
        followup_count: body.followup_count,
        last_followup_at: new Date().toISOString(),
      };
    } else {
      // Default: increment
      updates = {
        followup_count: (contact.followup_count || 0) + 1,
        last_followup_at: new Date().toISOString(),
      };
    }

    const { error: updateError } = await supabase
      .from("contacts")
      .update(updates)
      .eq("id", contact.id);

    if (updateError) {
      return new Response(
        JSON.stringify({ error: "Erro ao atualizar follow-up", details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If move_to_stage_slug is set, move the lead to that stage
    let moved = false;
    if (move_to_stage_slug) {
      // Find target tag by slug
      const { data: targetTag } = await supabase
        .from("tags")
        .select("id")
        .eq("account_id", account_id)
        .eq("slug", move_to_stage_slug)
        .eq("type", "stage")
        .eq("ativo", true)
        .single();

      if (targetTag) {
        // Remove existing stage tags
        const { data: existingTags } = await supabase
          .from("lead_tags")
          .select("id, tag_id")
          .eq("contact_id", contact.id);

        if (existingTags && existingTags.length > 0) {
          // Get all stage tag IDs
          const tagIds = existingTags.map((lt) => lt.tag_id);
          const { data: stageTags } = await supabase
            .from("tags")
            .select("id")
            .in("id", tagIds)
            .eq("type", "stage");

          if (stageTags && stageTags.length > 0) {
            const stageTagIds = stageTags.map((t) => t.id);
            await supabase
              .from("lead_tags")
              .delete()
              .eq("contact_id", contact.id)
              .in("tag_id", stageTagIds);
          }
        }

        // Apply new stage tag
        await supabase.from("lead_tags").insert({
          contact_id: contact.id,
          tag_id: targetTag.id,
          source: "system",
        });

        moved = true;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        contact_id: contact.id,
        followup_count: updates.followup_count,
        last_followup_at: updates.last_followup_at,
        moved,
        move_to_stage_slug: moved ? move_to_stage_slug : null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Erro interno", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
