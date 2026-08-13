import { prisma } from './prisma';
import { logger } from './logger';

// Seeds ONLY platform business-rule settings (configurable constants), never any
// marketplace data. The DB starts with ZERO users, properties, transactions, etc.
const DEFAULT_SETTINGS: { key: string; value: string }[] = [
  { key: 'linkpoint_commission_pct', value: '10' },
  { key: 'affiliate_commission_min_pct', value: '4' },
  { key: 'affiliate_commission_max_pct', value: '6' },
  { key: 'inspection_agent_commission_pct', value: '50' },
  { key: 'inspection_base_fee_minor', value: '500000' }, // ₦5,000
  { key: 'inspection_local_surcharge_minor', value: '0' },
  { key: 'inspection_regional_surcharge_minor', value: '500000' },
  { key: 'inspection_remote_surcharge_minor', value: '1500000' },
  { key: 'withdrawal_min_minor', value: '10000' },
  { key: 'withdrawal_max_minor', value: '5000000000' },
  { key: 'platform_version', value: '0.1.0' },
];

export async function ensureDefaultSettings(): Promise<void> {
  let inserted = 0;
  for (const s of DEFAULT_SETTINGS) {
    const created = await prisma.platformSetting.upsert({
      where: { key: s.key },
      update: {},
      create: { key: s.key, value: s.value },
    });
    if (created.value === s.value) inserted++;
  }
  logger.info(`Platform settings ensured (${DEFAULT_SETTINGS.length} keys). DB starts empty of marketplace data.`);
}
