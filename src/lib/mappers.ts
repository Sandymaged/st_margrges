import { ScoutProfile } from '../types';

/** Column list for `.select()` calls that need a full ScoutProfile. */
export const PROFILE_COLUMNS =
  'id, name, email, number, stage, team, role, is_verified, show_welcome_groups, amount_paid, attendance, badges, past_waves, passed_badges, permissions, created_at, join_date';

export function rowToScoutProfile(row: Record<string, any>): ScoutProfile {
  return {
    uid: row.id,
    name: row.name,
    email: row.email,
    number: row.number,
    stage: row.stage,
    team: row.team ?? undefined,
    role: row.role,
    isVerified: row.is_verified,
    showWelcomeGroups: row.show_welcome_groups,
    amountPaid: row.amount_paid != null ? Number(row.amount_paid) : undefined,
    attendance: row.attendance ?? {},
    badges: row.badges,
    pastWaves: row.past_waves ?? {},
    passedBadges: row.passed_badges ?? [],
    permissions: row.permissions ?? undefined,
    createdAt: row.created_at,
    joinDate: row.join_date,
  };
}
