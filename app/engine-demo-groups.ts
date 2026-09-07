import { EngineEventType, EngineExampleView } from './engine-types';

export type DemoGroupId = 'purchases' | 'marketplace' | 'usage' | 'refunds';

export type DemoGroup = {
  id: DemoGroupId;
  label: string;
  examples: EngineExampleView[];
};

const GROUP_ORDER: Array<{
  id: DemoGroupId;
  label: string;
  types: EngineEventType[];
  keys: string[];
}> = [
  {
    id: 'purchases',
    label: 'Purchases',
    types: ['PURCHASE', 'PAYMENT'],
    keys: ['starbucks', 'amazon', 'uber']
  },
  {
    id: 'marketplace',
    label: 'Marketplace',
    types: ['MARKETPLACE_SALE', 'SELLER_PAYOUT'],
    keys: ['acme-sale', 'techworld-sale', 'fashionhub-payout']
  },
  {
    id: 'usage',
    label: 'Usage',
    types: ['USAGE'],
    keys: ['aws-ec2', 'aws-s3']
  },
  {
    id: 'refunds',
    label: 'Refunds',
    types: ['REFUND'],
    keys: ['refund']
  }
];

export function isCannedExample(example: EngineExampleView): boolean {
  return !example.key.startsWith('custom-');
}

export function groupDemoExamples(examples: EngineExampleView[]): DemoGroup[] {
  const canned = examples.filter(isCannedExample);
  return GROUP_ORDER.map((group) => {
    const members = canned.filter((example) => group.types.includes(example.type));
    const ranked = [...members].sort((a, b) => {
      const aIndex = group.keys.indexOf(a.key);
      const bIndex = group.keys.indexOf(b.key);
      return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
    });
    return { id: group.id, label: group.label, examples: ranked };
  }).filter((group) => group.examples.length > 0);
}

export function policyBookName(type: EngineEventType): string {
  if (type === 'MARKETPLACE_SALE' || type === 'SELLER_PAYOUT') {
    return 'Marketplace Accounting';
  }
  if (type === 'WALLET_LOAD' || type === 'WALLET_SPEND') {
    return 'Wallet Accounting';
  }
  if (type === 'USAGE') {
    return 'Usage Accounting';
  }
  if (type === 'REFUND') {
    return 'Refund Accounting';
  }
  return 'Expense Accounting';
}
