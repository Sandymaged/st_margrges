export type Stage = 'أشبال وزهرات' | 'كشاف ومرشدات' | 'متقدم ورائدات';

export interface BadgeProgress {
  name: string;
  progress: number; // 0 to 100
  notes: string;
  completedRequirements?: string[];
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
  createdAt: any;
  joinDate: any;
}

export const STAGES: Stage[] = [
  'أشبال وزهرات',
  'كشاف ومرشدات',
  'متقدم ورائدات'
];

export type BadgeSettings = Record<string, {
  badge1: string[];
  badge2: string[];
  badge3: string[];
}>;

export type BadgeRequirements = Record<string, string[]>;

export const BADGE_OPTIONS = [
  'المسعف',
  'صديق البيئة',
  'المصور',
  'المبرمج',
  'الطباخ',
  'الرياضي',
  'الفنان',
  'المخترع',
  'القارئ',
  'المنقذ'
];

export const PHONE_REGEX = /^01[0125]\d{8}$/;
