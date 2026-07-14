export const UI_BRANDING = {
  showSignature: true,
  signatureText: 'YABUJIN',
  signatureTagline: 'Yonetim Konsolu',
  buildVersion: (import.meta.env.VITE_BUILD_VERSION as string | undefined)?.trim() || 'dev',
} as const
