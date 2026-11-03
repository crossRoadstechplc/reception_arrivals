import { createClient } from "@supabase/supabase-js";

export async function notifyGuestsChanged() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const channel = supabase.channel("reception-board");
  try {
    await channel.httpSend("guests-changed", { refresh: true });
  } finally {
    await supabase.removeChannel(channel);
  }
}
