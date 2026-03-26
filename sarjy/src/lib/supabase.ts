import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl) throw new Error("Missing env var: NEXT_PUBLIC_SUPABASE_URL");
if (!supabaseKey) throw new Error("Missing env var: SUPABASE_SECRET_KEY");

export const supabase = createClient(supabaseUrl, supabaseKey);
