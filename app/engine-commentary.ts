import { EngineProcessResult, rupee } from './engine-types';

export type WaiterMood =
  | 'waiting'
  | 'arrives'
  | 'matching'
  | 'unmatched'
  | 'success'
  | 'posting'
  | 'error';

export type Commentary = {
  mood: WaiterMood;
  line: string;
};

export const IDLE_LINES: string[] = [
  'Nothing to do. Send me a transaction.',
  'Seriously? You built an accounting engine and gave me nothing to account for.',
  'The queue is empty. That is not a flex.',
  'I could be posting journals. Instead I am standing here.',
  'Quiet night. The auditors would be thrilled.'
];

export const COMPLETED_LINES: string[] = [
  "Done. I'm waiting for the next one.",
  'Posted. Send me another.'
];

export const WAITER_PORTRAITS: Record<WaiterMood, string> = {
  waiting: '/engine/waiter/waiting.jpg',
  arrives: '/engine/waiter/arrives.jpg',
  matching: '/engine/waiter/matching.jpg',
  unmatched: '/engine/waiter/unmatched.jpg',
  success: '/engine/waiter/success.jpg',
  posting: '/engine/waiter/posting.jpg',
  error: '/engine/waiter/error.jpg'
};

export function commentaryFor(input: {
  queueCount: number;
  processing: boolean;
  activeIndex: number;
  result: EngineProcessResult | null;
  idleTick: number;
}): Commentary {
  const result = input.result;
  if (!input.processing && input.queueCount === 0) {
    if (result !== null && input.activeIndex >= 0) {
      return {
        mood: 'waiting',
        line: COMPLETED_LINES[Math.abs(input.idleTick) % COMPLETED_LINES.length] ?? COMPLETED_LINES[0]
      };
    }
    return {
      mood: 'waiting',
      line: IDLE_LINES[Math.abs(input.idleTick) % IDLE_LINES.length] ?? IDLE_LINES[0]
    };
  }

  if (result === null) {
    return { mood: 'waiting', line: 'Whenever you are ready. I am not going to start without you.' };
  }

  if (input.activeIndex < 0) {
    return { mood: 'arrives', line: arrivesLine(result) };
  }

  const unmatched = result.evaluation.matched === false || result.evaluation.selectedRule === null;
  const failed = result.error !== null || result.journal === null || result.journal.posted !== true || result.journal.balanced === false;

  if (input.activeIndex === 0) {
    return { mood: 'arrives', line: policyLine(result) };
  }
  if (input.activeIndex === 1) {
    if (unmatched) {
      return { mood: 'unmatched', line: unmatchedLine(result) };
    }
    return { mood: 'matching', line: matchingLine(result) };
  }
  if (input.activeIndex === 2) {
    return { mood: unmatched ? 'unmatched' : 'matching', line: transactionalLine(result) };
  }
  if (input.activeIndex === 3) {
    return { mood: failed && unmatched ? 'unmatched' : 'matching', line: journalLine(result) };
  }
  if (input.activeIndex === 4) {
    if (failed) {
      return { mood: 'error', line: errorLine(result) };
    }
    return { mood: 'success', line: 'Balanced. Miracles happen.' };
  }
  if (failed) {
    return { mood: 'error', line: errorLine(result) };
  }
  return { mood: 'posting', line: 'Posted. Next.' };
}

function arrivesLine(result: EngineProcessResult): string {
  const merchant = result.merchant.toLowerCase();
  if (result.type === 'MARKETPLACE_SALE') {
    return 'Marketplace sale. Great. Someone made money. Now I have to figure out who gets it.';
  }
  if (merchant.includes('starbucks')) {
    return result.amount > 5000
      ? 'Starbucks. Over ₹5,000. Apparently coffee is now a business expense.'
      : 'Starbucks. Fine. Coffee it is.';
  }
  if (merchant.includes('amazon')) {
    return result.evaluation.matched
      ? 'Amazon again. At least this one has a rule.'
      : 'You sent me an Amazon receipt. Apparently we need another Software Expense rule.';
  }
  if (merchant.includes('unknown')) {
    return 'Unknown SaaS. No rule. I am not guessing. That is literally how accounting disasters happen.';
  }
  if (result.type === 'WALLET_LOAD') {
    return 'Wallet load. Money goes in. Try not to lose it.';
  }
  if (result.type === 'WALLET_SPEND') {
    return 'Wallet purchase. Balance goes down. That is how wallets work.';
  }
  if (result.type === 'USAGE') {
    return 'Usage. Metered. Someone is going to get a bill.';
  }
  if (result.type === 'REFUND') {
    return 'A refund. Someone wants their money back. Fine.';
  }
  if (result.type === 'SELLER_PAYOUT') {
    return 'Seller payout. They earned it. I just have to move it.';
  }
  return 'Oh. Here we go.';
}

function policyLine(result: EngineProcessResult): string {
  if (result.type === 'MARKETPLACE_SALE') {
    return 'Marketplace sale. One policy. Do not make me hunt.';
  }
  return 'Let\'s see if you actually configured this properly.';
}

function matchingLine(result: EngineProcessResult): string {
  const rule = result.evaluation.selectedRule;
  if (rule === null) {
    return unmatchedLine(result);
  }
  if (result.merchant.toLowerCase().includes('amazon')) {
    return 'Amazon again. At least this one has a rule.';
  }
  return 'Let\'s see if you actually configured this properly.';
}

function unmatchedLine(result: EngineProcessResult): string {
  if (result.merchant.toLowerCase().includes('unknown')) {
    return 'Unknown SaaS. No rule. I am not guessing. That is literally how accounting disasters happen.';
  }
  return 'No rule. I am not making this up for you.';
}

function transactionalLine(result: EngineProcessResult): string {
  const transactional = result.transactional;
  if (transactional === null) {
    return 'No operational balance. Just the books, then.';
  }
  if (result.type === 'MARKETPLACE_SALE') {
    const fee = transactional.composition.lines.find((line) => line.type === 'FEE');
    const tax = transactional.composition.lines.find((line) => line.type === 'TAX');
    const net = rupee(Math.abs(transactional.composition.total));
    const feeBit = fee === undefined ? '' : 'Fee. ';
    const taxBit = tax === undefined ? '' : 'Tax. ';
    return `${feeBit}${taxBit}${net} for the seller. Congratulations, ${result.merchant}.`;
  }
  if (result.type === 'WALLET_LOAD' || result.type === 'WALLET_SPEND') {
    return `${transactional.participantName}. Wallet ${rupee(transactional.balanceAfter)}. Noted.`;
  }
  return `${transactional.participantName}. ${rupee(Math.abs(transactional.composition.total))}. Moving on.`;
}

function journalLine(result: EngineProcessResult): string {
  if (result.journal === null) {
    return 'No journal. That is not a result. That is a shrug.';
  }
  return 'Debits. Credits. The only poetry that matters.';
}

function errorLine(result: EngineProcessResult): string {
  if (result.journal !== null && result.journal.balanced === false) {
    return 'That journal does not balance. Who wrote this rule?';
  }
  if (result.evaluation.matched === false) {
    return 'No rule. I am not guessing. Teach me in Studio if you want this posted.';
  }
  return result.error ?? 'Something broke. I am not covering for it.';
}
