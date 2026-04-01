export type Stage = 
  | 'أشبال مبتدأ'
  | 'زهرات مبتدأ'
  | 'أشبال'
  | 'زهرات'
  | 'كشاف'
  | 'مرشدات'
  | 'متقدم'
  | 'رائدات'
  | 'جوالة'
  | 'قادة';

export interface BadgeProgress {
  name: string;
  progress: number; // 0 to 100
  notes: string;
  completedRequirements?: string[];
  requirementScores?: Record<string, number>;
}

export interface AdminPermissions {
  canManagePermissions?: boolean;
  canManageAllBadges: boolean;
  canDeleteAccounts: boolean;
  managedStages: Stage[];
  managedBadges: string[];
}

export interface ScoutProfile {
  uid: string;
  name: string;
  email: string;
  stage: Stage;
  number: string;
  badges: {
    badge1: BadgeProgress;
    badge2: BadgeProgress;
    badge3: BadgeProgress;
  };
  role: 'scout' | 'admin';
  isVerified: boolean;
  permissions?: AdminPermissions;
  createdAt: any;
  joinDate: any;
}

export const STAGES: Stage[] = [
  'أشبال مبتدأ',
  'زهرات مبتدأ',
  'أشبال',
  'زهرات',
  'كشاف',
  'مرشدات',
  'متقدم',
  'رائدات',
  'جوالة',
  'قادة'
];

export interface BadgeCategory {
  id: string;
  name: string;
  badges: string[];
  stageBadges?: Partial<Record<Stage, string[]>>;
}

export interface BadgeSettings {
  categories: BadgeCategory[];
  requirements: Record<string, Partial<Record<Stage | 'all', string[]>>>;
  requirementMaxScores?: Record<string, Record<string, number>>;
  requirementCategories?: Record<string, Record<string, string>>;
}

export interface GeneralSettings {
  logoUrl: string;
  scoutGroupName: string;
  allowedRegistrationStages?: Stage[];
}

export const DEFAULT_CATEGORIES: BadgeCategory[] = [
  {
    id: 'scout',
    name: 'شارات كشفي',
    badges: ['مخيم', 'مخاطب الإشارة', 'مقتفي الأثر', 'طاهي', 'مسعف']
  },
  {
    id: 'artistic',
    name: 'شارات فنية',
    badges: ['رسام', 'مصور', 'مسامر', 'هاوي الأشغال اليدوية', 'موسيقى']
  },
  {
    id: 'cultural',
    name: 'شارات ثقافية',
    badges: ['مترجم', 'مبرمج', 'مصمم جرافيك', 'صحفي', 'مطالع', 'فيديو (مونتاج)']
  }
];

export const BADGE_LABELS = {
  badge1: "شارة 1 'كشفي'",
  badge2: 'شارة 2',
  badge3: 'شارة 3'
};

export const PHONE_REGEX = /^01[0125]\d{8}$/;
