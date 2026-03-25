import { supabase } from "./supabase";

// ── Preferences ─────────────────────────────────────────────────────

export type SavePreferenceResult =
  | { status: "created"; value: string }
  | { status: "unchanged"; value: string }
  | { status: "updated"; previousValue: string; value: string };

export async function savePreference(
  userId: string,
  key: string,
  value: string,
): Promise<SavePreferenceResult> {
  const { data: existing } = await supabase
    .from("preferences")
    .select("value")
    .eq("user_id", userId)
    .eq("key", key)
    .limit(1)
    .single();

  if (existing?.value === value) {
    return { status: "unchanged", value };
  }

  const previousValue = existing?.value;

  const { error } = await supabase
    .from("preferences")
    .upsert(
      { user_id: userId, key, value, updated_at: new Date().toISOString() },
      { onConflict: "user_id,key" },
    );

  if (error) throw new Error(`Failed to save preference: ${error.message}`);

  if (previousValue) {
    return { status: "updated", previousValue, value };
  }
  return { status: "created", value };
}

export async function getPreferences(
  userId: string,
): Promise<Array<{ key: string; value: string }>> {
  const { data, error } = await supabase
    .from("preferences")
    .select("key, value")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(`Failed to get preferences: ${error.message}`);
  return data ?? [];
}

export async function getPreferenceValue(
  userId: string,
  key: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("preferences")
    .select("value")
    .eq("user_id", userId)
    .eq("key", key)
    .limit(1)
    .single();

  if (error || !data) return null;
  return data.value ?? null;
}

// ── Conversation history ────────────────────────────────────────────

export async function saveConversationMessage(
  userId: string,
  role: "user" | "assistant",
  content: string,
): Promise<void> {
  const { error } = await supabase
    .from("conversation_history")
    .insert({ user_id: userId, role, content });

  if (error) throw new Error(`Failed to save message: ${error.message}`);
}

export async function getRecentConversation(
  userId: string,
  limit = 20,
): Promise<Array<{ role: string; content: string }>> {
  const { data, error } = await supabase
    .from("conversation_history")
    .select("role, content")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to get conversation: ${error.message}`);
  return (data ?? []).reverse();
}
