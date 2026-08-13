import { prisma } from './prisma';
import { DEFAULT_BUSINESS_RULES } from '@linkpoint/types';

// Cache settings in-process with short TTL to avoid DB hits on every request.
let cache: { data: Record<string, string>; ts: number } | null = null;
const TTL_MS = 30_000;

const SETTING_KEYS = {
  linkpointCommissionPct: 'linkpoint_commission_pct',
  affiliateCommissionMinPct: 'affiliate_commission_min_pct',
  affiliateCommissionMaxPct: 'affiliate_commission_max_pct',
  inspectionAgentCommissionPct: 'inspection_agent_commission_pct',
  inspectionBaseFeeMinor: 'inspection_base_fee_minor',
  inspectionLocalSurchargeMinor: 'inspection_local_surcharge_minor',
  inspectionRegionalSurchargeMinor: 'inspection_regional_surcharge_minor',
  inspectionRemoteSurchargeMinor: 'inspection_remote_surcharge_minor',
  withdrawalMinMinor: 'withdrawal_min_minor',
  withdrawalMaxMinor: 'withdrawal_max_minor',
} as const;

export type SettingKey = keyof typeof SETTING_KEYS;

async function loadAll(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cache && now - cache.ts < TTL_MS) return cache.data;
  const rows = await prisma.platformSetting.findMany();
  const data: Record<string, string> = {};
  for (const r of rows) data[r.key] = r.value;
  cache = { data, ts: now };
  return data;
}

export async function getSetting(key: SettingKey): Promise<number> {
  const all = await loadAll();
  const raw = all[SETTING_KEYS[key]];
  const parsed = raw ? Number.parseFloat(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : defaultFor(key);
}

export async function getSettingString(key: string): Promise<string | undefined> {
  const all = await loadAll();
  return all[key];
}

export async function getAllSettings(): Promise<Record<string, string>> {
  return loadAll();
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.platformSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
  cache = null; // invalidate
}

function defaultFor(key: SettingKey): number {
  switch (key) {
    case 'linkpointCommissionPct':
      return DEFAULT_BUSINESS_RULES.linkpointCommissionPct;
    case 'affiliateCommissionMinPct':
      return DEFAULT_BUSINESS_RULES.affiliateCommissionMinPct;
    case 'affiliateCommissionMaxPct':
      return DEFAULT_BUSINESS_RULES.affiliateCommissionMaxPct;
    case 'inspectionAgentCommissionPct':
      return DEFAULT_BUSINESS_RULES.inspectionAgentCommissionPct;
    case 'inspectionBaseFeeMinor':
      return 5_00_00; // ₦5,000 base (minor)
    case 'inspectionLocalSurchargeMinor':
      return 0;
    case 'inspectionRegionalSurchargeMinor':
      return 5_00_00;
    case 'inspectionRemoteSurchargeMinor':
      return 15_00_00;
    case 'withdrawalMinMinor':
      return 1_00_00;
    case 'withdrawalMaxMinor':
      return 50_000_00_00;
    default:
      return 0;
  }
}
