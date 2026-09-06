import {
  applyResolutions,
  matchTransactions,
  ReconEventType,
  ReconJournalLine,
  ReconParty,
  ReconciliationRun
} from '../../domain/recon';

export const DEMO_RECON_DATE = '2026-09-06';
export const DEMO_RECON_ID = 'run-cc-2026-09-06';
export const DEMO_RECON_RESOLVED_AT = '2026-09-06T09:40:00.000Z';
export const DEMO_EXTERNAL_TOTAL = 384200;

type Seed = {
  slug: string;
  merchant: string;
  type: ReconEventType;
  externalAmount?: number;
  kanakkuAmount?: number;
  description?: string;
  debitCode: string;
  debitName: string;
  creditCode?: string;
  creditName?: string;
  resolution?: string;
};

function lines(amount: number, seed: Seed): ReconJournalLine[] {
  return [
    { side: 'DEBIT', accountCode: seed.debitCode, accountName: seed.debitName, amount },
    {
      side: 'CREDIT',
      accountCode: seed.creditCode ?? '2000',
      accountName: seed.creditName ?? 'Corporate Card',
      amount
    }
  ];
}

function party(
  side: 'ext' | 'knk',
  seed: Seed,
  sequence: number,
  amount: number
): ReconParty {
  const description = seed.description ?? `${seed.merchant} ${seed.type === 'USAGE' ? 'Usage' : 'Purchase'}`;
  return {
    id: `${side}-${seed.slug}`,
    reference: `CC-0906-${seed.slug}`,
    counterparty: seed.merchant,
    description,
    amount,
    currency: 'INR',
    date: DEMO_RECON_DATE,
    type: seed.type,
    sequence,
    lines: side === 'knk' ? lines(amount, seed) : []
  };
}

const SHOWCASE: Seed[] = [
  {
    slug: 'amazon',
    merchant: 'Amazon',
    type: 'PURCHASE',
    externalAmount: 8000,
    kanakkuAmount: 8000,
    description: 'Amazon Purchase',
    debitCode: '6100',
    debitName: 'Software Expense',
    creditCode: '2100',
    creditName: 'Accounts Payable'
  },
  {
    slug: 'starbucks',
    merchant: 'Starbucks',
    type: 'PURCHASE',
    externalAmount: 7800,
    kanakkuAmount: 7800,
    description: 'Starbucks Expense',
    debitCode: '5220',
    debitName: 'Business Meals'
  },
  {
    slug: 'aws',
    merchant: 'AWS',
    type: 'USAGE',
    externalAmount: 480,
    kanakkuAmount: 480,
    description: 'AWS Usage',
    debitCode: '6200',
    debitName: 'Cloud Infrastructure',
    creditCode: '2100',
    creditName: 'Accounts Payable'
  },
  {
    slug: 'uber',
    merchant: 'Uber',
    type: 'PURCHASE',
    externalAmount: 1240,
    kanakkuAmount: 1200,
    description: 'Uber Purchase',
    debitCode: '6300',
    debitName: 'Travel Expense'
  },
  {
    slug: 'unknown-saas',
    merchant: 'Unknown SaaS',
    type: 'USAGE',
    externalAmount: 240,
    description: 'Unknown SaaS',
    debitCode: '6100',
    debitName: 'Software Expense'
  },
  {
    slug: 'office-depot',
    merchant: 'Office Depot',
    type: 'PURCHASE',
    externalAmount: 12450,
    kanakkuAmount: 12450,
    description: 'Office Depot',
    debitCode: '6400',
    debitName: 'Office Expense'
  },
  {
    slug: 'microsoft',
    merchant: 'Microsoft',
    type: 'PURCHASE',
    externalAmount: 8500,
    kanakkuAmount: 8000,
    description: 'Microsoft 365',
    debitCode: '6100',
    debitName: 'Software Expense',
    creditCode: '2100',
    creditName: 'Accounts Payable',
    resolution: 'Marketplace fee was included in the external amount.'
  },
  {
    slug: 'slack',
    merchant: 'Slack',
    type: 'PURCHASE',
    kanakkuAmount: 2400,
    description: 'Slack',
    debitCode: '6100',
    debitName: 'Software Expense',
    creditCode: '2100',
    creditName: 'Accounts Payable'
  }
];

const FILLERS: Seed[] = [
  { slug: 'swiggy', merchant: 'Swiggy', type: 'PURCHASE', externalAmount: 1800, kanakkuAmount: 1800, debitCode: '5220', debitName: 'Business Meals' },
  { slug: 'zomato', merchant: 'Zomato', type: 'PURCHASE', externalAmount: 2200, kanakkuAmount: 2200, debitCode: '5220', debitName: 'Business Meals' },
  { slug: 'flipkart', merchant: 'Flipkart', type: 'PURCHASE', externalAmount: 15600, kanakkuAmount: 15600, debitCode: '6400', debitName: 'Office Expense' },
  { slug: 'bigbasket', merchant: 'BigBasket', type: 'PURCHASE', externalAmount: 4300, kanakkuAmount: 4300, debitCode: '6400', debitName: 'Office Expense' },
  { slug: 'indigo', merchant: 'IndiGo', type: 'PURCHASE', externalAmount: 18900, kanakkuAmount: 18900, debitCode: '6300', debitName: 'Travel Expense' },
  { slug: 'makemytrip', merchant: 'MakeMyTrip', type: 'PURCHASE', externalAmount: 12400, kanakkuAmount: 12400, debitCode: '6300', debitName: 'Travel Expense' },
  { slug: 'irctc', merchant: 'IRCTC', type: 'PURCHASE', externalAmount: 3400, kanakkuAmount: 3400, debitCode: '6300', debitName: 'Travel Expense' },
  { slug: 'bookmyshow', merchant: 'BookMyShow', type: 'PURCHASE', externalAmount: 1800, kanakkuAmount: 1800, debitCode: '5220', debitName: 'Business Meals' },
  { slug: 'netflix', merchant: 'Netflix', type: 'PURCHASE', externalAmount: 650, kanakkuAmount: 650, debitCode: '6100', debitName: 'Software Expense' },
  { slug: 'spotify', merchant: 'Spotify', type: 'PURCHASE', externalAmount: 200, kanakkuAmount: 200, debitCode: '6100', debitName: 'Software Expense' },
  { slug: 'zoom', merchant: 'Zoom', type: 'PURCHASE', externalAmount: 1600, kanakkuAmount: 1600, debitCode: '6100', debitName: 'Software Expense' },
  { slug: 'figma', merchant: 'Figma', type: 'PURCHASE', externalAmount: 1500, kanakkuAmount: 1500, debitCode: '6100', debitName: 'Software Expense' },
  { slug: 'github', merchant: 'GitHub', type: 'PURCHASE', externalAmount: 2100, kanakkuAmount: 2100, debitCode: '6100', debitName: 'Software Expense' },
  { slug: 'notion', merchant: 'Notion', type: 'PURCHASE', externalAmount: 800, kanakkuAmount: 800, debitCode: '6100', debitName: 'Software Expense' },
  { slug: 'atlassian', merchant: 'Atlassian', type: 'PURCHASE', externalAmount: 3200, kanakkuAmount: 3200, debitCode: '6100', debitName: 'Software Expense' },
  { slug: 'linkedin', merchant: 'LinkedIn', type: 'PURCHASE', externalAmount: 4500, kanakkuAmount: 4500, debitCode: '6100', debitName: 'Software Expense' },
  { slug: 'google-workspace', merchant: 'Google Workspace', type: 'PURCHASE', externalAmount: 1700, kanakkuAmount: 1700, debitCode: '6100', debitName: 'Software Expense' },
  { slug: 'dropbox', merchant: 'Dropbox', type: 'PURCHASE', externalAmount: 1200, kanakkuAmount: 1200, debitCode: '6100', debitName: 'Software Expense' },
  { slug: 'wework', merchant: 'WeWork', type: 'PURCHASE', externalAmount: 18500, kanakkuAmount: 18500, debitCode: '6400', debitName: 'Office Expense' },
  { slug: 'taj-hotels', merchant: 'Taj Hotels', type: 'PURCHASE', externalAmount: 24600, kanakkuAmount: 24600, debitCode: '6300', debitName: 'Travel Expense' },
  { slug: 'ola', merchant: 'Ola', type: 'PURCHASE', externalAmount: 1000, kanakkuAmount: 1000, debitCode: '6300', debitName: 'Travel Expense' },
  { slug: 'blusmart', merchant: 'BluSmart', type: 'PURCHASE', externalAmount: 600, kanakkuAmount: 600, debitCode: '6300', debitName: 'Travel Expense' },
  { slug: 'decathlon', merchant: 'Decathlon', type: 'PURCHASE', externalAmount: 8900, kanakkuAmount: 8900, debitCode: '6400', debitName: 'Office Expense' },
  { slug: 'ikea', merchant: 'IKEA', type: 'PURCHASE', externalAmount: 15700, kanakkuAmount: 15700, debitCode: '6400', debitName: 'Office Expense' },
  { slug: 'croma', merchant: 'Croma', type: 'PURCHASE', externalAmount: 22400, kanakkuAmount: 22400, debitCode: '6400', debitName: 'Office Expense' },
  { slug: 'reliance-digital', merchant: 'Reliance Digital', type: 'PURCHASE', externalAmount: 9800, kanakkuAmount: 9800, debitCode: '6400', debitName: 'Office Expense' },
  { slug: 'apollo', merchant: 'Apollo Pharmacy', type: 'PURCHASE', externalAmount: 1300, kanakkuAmount: 1300, debitCode: '6400', debitName: 'Office Expense' },
  { slug: 'urban-company', merchant: 'Urban Company', type: 'PURCHASE', externalAmount: 2400, kanakkuAmount: 2400, debitCode: '6400', debitName: 'Office Expense' },
  { slug: 'freshworks', merchant: 'Freshworks', type: 'PURCHASE', externalAmount: 7200, kanakkuAmount: 7200, debitCode: '6100', debitName: 'Software Expense' },
  { slug: 'postman', merchant: 'Postman', type: 'PURCHASE', externalAmount: 2400, kanakkuAmount: 2400, debitCode: '6100', debitName: 'Software Expense' },
  { slug: 'vercel', merchant: 'Vercel', type: 'PURCHASE', externalAmount: 2400, kanakkuAmount: 2400, debitCode: '6200', debitName: 'Cloud Infrastructure' },
  { slug: 'cloudflare', merchant: 'Cloudflare', type: 'PURCHASE', externalAmount: 2000, kanakkuAmount: 2000, debitCode: '6200', debitName: 'Cloud Infrastructure' },
  { slug: 'digitalocean', merchant: 'DigitalOcean', type: 'PURCHASE', externalAmount: 4800, kanakkuAmount: 4800, debitCode: '6200', debitName: 'Cloud Infrastructure' },
  { slug: 'dell', merchant: 'Dell', type: 'PURCHASE', externalAmount: 143640, kanakkuAmount: 143640, debitCode: '6400', debitName: 'Office Expense' }
];

export const DEMO_RECON_SEEDS: Seed[] = [...SHOWCASE, ...FILLERS];

export function demoReconSides(): { externals: ReconParty[]; kanakku: ReconParty[] } {
  const externals: ReconParty[] = [];
  const kanakku: ReconParty[] = [];
  DEMO_RECON_SEEDS.forEach((seed, index) => {
    const sequence = index + 1;
    if (seed.externalAmount !== undefined) {
      externals.push(party('ext', seed, sequence, seed.externalAmount));
    }
    if (seed.kanakkuAmount !== undefined) {
      kanakku.push(party('knk', seed, sequence, seed.kanakkuAmount));
    }
  });
  return { externals, kanakku };
}

export function createDemoReconRun(): ReconciliationRun {
  const { externals, kanakku } = demoReconSides();
  const items = matchTransactions(externals, kanakku);
  const resolutions: Record<string, { reason: string; resolvedAt: string }> = {};
  for (const seed of DEMO_RECON_SEEDS) {
    if (seed.resolution !== undefined) {
      resolutions[`item-ext-${seed.slug}`] = {
        reason: seed.resolution,
        resolvedAt: DEMO_RECON_RESOLVED_AT
      };
    }
  }
  return {
    id: DEMO_RECON_ID,
    name: 'Corporate Card',
    sourceLabel: 'CORPORATE CARD',
    date: DEMO_RECON_DATE,
    status: 'OPEN',
    items: applyResolutions(items, resolutions)
  };
}
