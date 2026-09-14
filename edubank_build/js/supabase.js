const SUPABASE_URL='https://udtbudxpndrvzoecascn.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_5KmxWnmhPNpTSiSAGpMfeA_Gy-ajYOh';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
});
