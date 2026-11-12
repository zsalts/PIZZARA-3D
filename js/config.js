/* ============ configuración de Supabase (guardar en la nube) ============
   Copiá estos dos valores de Supabase → Project Settings → API (o "Connect"):
   - Project URL           → SUPABASE_URL
   - anon / publishable key → SUPABASE_KEY
   Son públicos (van en el navegador); la seguridad la dan las políticas RLS de supabase/schema.sql.
   NUNCA pongas acá la "service_role" / "secret" key.
   Si quedan vacíos, la app funciona igual pero sin la opción de nube. */
export const SUPABASE_URL = 'https://qryulcqejtjsocodmvcl.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_CQaDUuMOh5qATOe4valuRA_SXB1H09y';
