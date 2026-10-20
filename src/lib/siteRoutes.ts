export const siteSubpageHashes = ['#music', '#guestbook', '#ai-commerce', '#commerce-admin', '#tools'] as const

export const isSiteSubpageHash = (hash: string): boolean => siteSubpageHashes.some((item) => item === hash)
