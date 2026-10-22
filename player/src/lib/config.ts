// config.ts
// Runtime toggles for optional providers. Defaults to true unless explicitly disabled.

export const ENABLE_VIDLINK = process.env.PROVIDER_VIDLINK_ENABLED !== 'false';
export const ENABLE_2EMBED = process.env.PROVIDER_2EMBED_ENABLED !== 'false';
export const ENABLE_RIVESTREAM = process.env.PROVIDER_RIVESTREAM_ENABLED !== 'false';
export const ENABLE_HYDRAHD = process.env.PROVIDER_HYDRAHD_ENABLED !== 'false';
export const ENABLE_RIDOMOVIE = process.env.PROVIDER_RIDOMOVIE_ENABLED !== 'false';
export const ENABLE_CINELITE = process.env.PROVIDER_CINELITE_ENABLED !== 'false';
export const ENABLE_FRAMEXTV = process.env.PROVIDER_FRAMEXTV_ENABLED !== 'false';
export const ENABLE_ATLANTIC = process.env.PROVIDER_ATLANTIC_ENABLED !== 'false';
export const ENABLE_MAPPLE = process.env.PROVIDER_MAPPLE_ENABLED !== 'false';
