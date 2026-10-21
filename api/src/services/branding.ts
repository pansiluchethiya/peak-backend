import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export interface BrandingConfig {
  name: string;
  logoUrl: string;
  accentColor: string;
  tagline: string;
}

export const DEFAULT_BRANDING: BrandingConfig = {
  name: 'PeakMovies',
  logoUrl: '/logo.svg',
  accentColor: '#6366f1',
  tagline: 'Stream anything',
};

export function brandingPath(): string {
  return process.env.BRANDING_FILE ?? resolve(process.cwd(), '../config/branding.json');
}

export async function readBranding(): Promise<BrandingConfig> {
  try {
    const raw = await readFile(brandingPath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<BrandingConfig>;
    return {
      name: parsed.name ?? DEFAULT_BRANDING.name,
      logoUrl: parsed.logoUrl ?? DEFAULT_BRANDING.logoUrl,
      accentColor: parsed.accentColor ?? DEFAULT_BRANDING.accentColor,
      tagline: parsed.tagline ?? DEFAULT_BRANDING.tagline,
    };
  } catch {
    return DEFAULT_BRANDING;
  }
}

export async function writeBranding(config: BrandingConfig): Promise<BrandingConfig> {
  const file = brandingPath();
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return config;
}
