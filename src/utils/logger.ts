import { supabase } from '../supabaseClient';

export const logActivity = async (
  action: string,
  details: string,
  _adminId: string,
  _adminName: string,
  targetUserId?: string,
  targetUserName?: string
) => {
  try {
    const { error } = await supabase.rpc('log_activity', {
      p_action: action,
      p_details: details,
      p_target_user_id: targetUserId || null,
      p_target_user_name: targetUserName || null,
    });
    if (error) throw error;
  } catch (error) {
    console.error('Failed to log activity:', error);
  }
};
