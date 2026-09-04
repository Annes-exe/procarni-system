import { supabase } from '@/integrations/supabase/client';

export interface ProfileNameSource {
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  email?: string | null;
}

/**
 * Formats full name ("Nombre Apellido") from a profile object or fallback.
 */
export const formatFullName = (
  profile?: ProfileNameSource | null,
  fallback?: string | null
): string => {
  if (profile) {
    const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim();
    if (fullName) return fullName;
    if (profile.username) return profile.username;
    if (profile.email) return profile.email.split('@')[0];
  }
  return fallback || 'Sistema';
};

/**
 * Asynchronously fetches the static full name ("Nombre Apellido") of the currently authenticated user
 * by querying their profile record in Supabase.
 */
export const getCurrentUserName = async (fallbackUserId?: string): Promise<string> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const targetUserId = user?.id || fallbackUserId;

    if (targetUserId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('first_name, last_name, username, email')
        .eq('id', targetUserId)
        .maybeSingle();

      if (profile) {
        const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim();
        if (fullName) return fullName;
        if (profile.username) return profile.username;
      }
    }

    const metadataName = user?.user_metadata?.full_name || user?.user_metadata?.name;
    if (metadataName) return metadataName;
    if (user?.email) return user.email.split('@')[0];

    return 'Sistema';
  } catch (err) {
    console.error('[getCurrentUserName] Error:', err);
    return 'Sistema';
  }
};
