export type AdminPermissionKey =
  | 'log'
  | 'regions'
  | 'departments'
  | 'employees'
  | 'devices'
  | 'work_rules'
  | 'attendance_events'
  | 'leaves'
  | 'reports'
  | 'compliance'
  | 'schedule'
  | 'qr_codes'
  | 'notifications'
  | 'communications'
  | 'audit_logs'
  | 'manual_overrides'
  | 'audit'
  | 'admin_users'
  | 'payroll'
  | 'depo'

export type AdminNavSectionKey =
  | 'overview'
  | 'organization'
  | 'attendance'
  | 'reporting'
  | 'administration'

export type AdminNavItem = {
  to: string
  label: string
  permission?: AdminPermissionKey
  section: AdminNavSectionKey
  aliases?: string[]
}

export type AdminNavSection = {
  key: AdminNavSectionKey
  label: string
  items: AdminNavItem[]
}

export const adminPermissionModules: Array<{
  key: AdminPermissionKey
  label: string
}> = [
  { key: 'log', label: 'Log' },
  { key: 'regions', label: 'Bölgeler' },
  { key: 'departments', label: 'Departmanlar' },
  { key: 'employees', label: 'Çalışanlar' },
  { key: 'devices', label: 'Cihazlar' },
  { key: 'work_rules', label: 'Mesai Kurallari' },
  { key: 'attendance_events', label: 'Yoklama Kayıtları' },
  { key: 'leaves', label: 'İzinler' },
  { key: 'reports', label: 'Raporlar' },
  { key: 'compliance', label: 'Uyumluluk' },
  { key: 'schedule', label: 'Planlama' },
  { key: 'qr_codes', label: 'QR Kodlar' },
  { key: 'notifications', label: 'Bildirimler' },
  { key: 'communications', label: 'Mesajlar' },
  { key: 'audit_logs', label: 'Sistem Logları' },
  { key: 'manual_overrides', label: 'Manuel Düzeltme' },
  { key: 'audit', label: 'Denetim' },
  { key: 'admin_users', label: 'Admin Kullanıcıları' },
  { key: 'payroll', label: 'Bordro / Hakediş' },
  { key: 'depo', label: 'Depo' },
]

export const adminNavItems: AdminNavItem[] = [
  {
    to: '/welcome',
    label: 'Hoş geldiniz',
    section: 'overview',
    aliases: ['/dashboard'],
  },
  {
    to: '/log',
    label: 'Log',
    permission: 'log',
    section: 'overview',
    aliases: ['/location-monitor', '/management-console', '/control-room'],
  },
  {
    to: '/asistan',
    label: 'Puantaj Zeka',
    permission: 'reports',
    section: 'overview',
  },
  {
    to: '/regions',
    label: 'Bölgeler',
    permission: 'regions',
    section: 'organization',
  },
  {
    to: '/departments',
    label: 'Departmanlar',
    permission: 'departments',
    section: 'organization',
  },
  {
    to: '/employees',
    label: 'Çalışanlar',
    permission: 'employees',
    section: 'organization',
  },
  {
    to: '/quick-setup',
    label: 'Hızlı Ayarlar',
    permission: 'schedule',
    section: 'attendance',
  },
  {
    to: '/work-rules',
    label: 'Mesai Kurallari',
    permission: 'work_rules',
    section: 'attendance',
  },
  {
    to: '/attendance-events',
    label: 'Yoklama Kayıtları',
    permission: 'attendance_events',
    section: 'attendance',
  },
  {
    to: '/devices',
    label: 'Cihazlar',
    permission: 'devices',
    section: 'attendance',
  },
  {
    to: '/compliance-settings',
    label: 'Uyumluluk Ayarlari',
    permission: 'compliance',
    section: 'reporting',
  },
  {
    to: '/qr-kodlar',
    label: 'QR Kodlar',
    permission: 'qr_codes',
    section: 'attendance',
  },
  {
    to: '/leaves',
    label: 'İzinler',
    permission: 'leaves',
    section: 'attendance',
  },
  {
    to: '/reports/employee-monthly',
    label: 'Aylık Çalışan Raporu',
    permission: 'reports',
    section: 'reporting',
  },
  {
    to: '/reports/department-summary',
    label: 'Departman Özeti',
    permission: 'reports',
    section: 'reporting',
  },
  {
    to: '/reports/excel-export',
    label: 'Excel Disa Aktar',
    permission: 'reports',
    section: 'reporting',
  },
  {
    to: '/ozluk',
    label: 'Özlük Yönetimi',
    permission: 'payroll',
    section: 'reporting',
  },
  {
    to: '/payroll',
    label: 'Bordro / Hakediş',
    permission: 'payroll',
    section: 'reporting',
  },
  {
    to: '/notifications',
    label: 'Bildirimler',
    permission: 'notifications',
    section: 'administration',
  },
  {
    to: '/communications',
    label: 'Mesajlar',
    permission: 'communications',
    section: 'administration',
  },
  {
    to: '/audit-logs',
    label: 'Sistem Logları',
    permission: 'audit_logs',
    section: 'administration',
  },
  {
    to: '/admin-users',
    label: 'Admin Kullanıcıları',
    permission: 'admin_users',
    section: 'administration',
  },
  {
    to: '/depo',
    label: 'Depo',
    permission: 'depo',
    section: 'administration',
  },
]

const adminNavSectionLabels: Array<{ key: AdminNavSectionKey; label: string }> =
  [
    { key: 'overview', label: 'Genel Bakış' },
    { key: 'organization', label: 'Organizasyon' },
    { key: 'attendance', label: 'Saha ve Yoklama' },
    { key: 'reporting', label: 'Raporlama ve Uyumluluk' },
    { key: 'administration', label: 'Sistem ve Yönetim' },
  ]

export const adminNavSections: AdminNavSection[] = adminNavSectionLabels.map(
  (section) => ({
    ...section,
    items: adminNavItems.filter((item) => item.section === section.key),
  }),
)

export const adminPageTitles: Record<string, string> = {
  '/welcome': 'Hoş geldiniz',
  '/dashboard': 'Hoş geldiniz',
  '/asistan': 'Puantaj Zeka',
  '/management-console': 'Log',
  '/log': 'Log',
  '/location-monitor': 'Log',
  '/control-room': 'Log',
  '/regions': 'Bölgeler',
  '/departments': 'Departmanlar',
  '/employees': 'Çalışanlar',
  '/quick-setup': 'Hızlı Ayarlar',
  '/work-rules': 'Mesai Kurallari',
  '/attendance-events': 'Yoklama Kayıtları',
  '/devices': 'Cihazlar',
  '/compliance-settings': 'Uyumluluk Ayarlari',
  '/qr-kodlar': 'QR Kodlar',
  '/leaves': 'İzinler',
  '/reports/employee-monthly': 'Aylık Çalışan Raporu',
  '/reports/department-summary': 'Departman Özeti',
  '/reports/excel-export': 'Excel Disa Aktar',
  '/ozluk': 'Özlük Yönetimi',
  '/payroll': 'Bordro / Hakediş',
  '/notifications': 'Bildirimler',
  '/communications': 'Mesajlar',
  '/audit-logs': 'Sistem Logları',
  '/admin-users': 'Admin Kullanıcıları',
  '/depo': 'Depo',
}

export function getFirstAccessibleAdminPath(
  hasPermission: (permission: string, mode?: 'read' | 'write') => boolean,
): string | null {
  const firstVisibleItem = adminNavItems.find(
    (item) => !item.permission || hasPermission(item.permission),
  )
  return firstVisibleItem?.to ?? null
}
