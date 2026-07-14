export const UI_BRANDING = {
  showSignature: true,
  signatureText: 'YABUJIN',
  signatureTagline: 'Calisan Portali',
  buildVersion: (import.meta.env.VITE_BUILD_VERSION as string | undefined)?.trim() || 'dev',
} as const
