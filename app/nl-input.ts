'use client';

import { EngineEventType } from './engine-types';

export interface ParsedTransaction {
  merchant: string;
  amount: number;
  type: EngineEventType;
  category?: string;
}

const EXAMPLES = [
  'I paid ₹25,000 for office rent.',
  'I received ₹2 lakh from Acme for consulting services.',
  'We bought 10 laptops for ₹8 lakh.',
  'I paid ₹50,000 for office furniture from my HDFC account.',
];

function parseRupeeAmount(text: string): number | null {
  // Match patterns like: ₹50,000, ₹50000, 50,000, 50000, 2 lakh, 8 lakh, 2L, 8L
  const lakhMatch = text.match(/(\d+(?:\.\d+)?)\s*[lL](?:akh)?/);
  if (lakhMatch) {
    return parseFloat(lakhMatch[1]) * 100000;
  }

  const rupeeMatch = text.match(/₹?\s*(\d[\d,]*)/);
  if (rupeeMatch) {
    return parseInt(rupeeMatch[1].replace(/,/g, ''), 10);
  }

  return null;
}

function extractMerchant(text: string): string | null {
  // Look for patterns like "from X", "to X", "at X", "X for"
  const patterns = [
    /from\s+(?:my\s+)?([A-Za-z][A-Za-z0-9\s.&'-]{2,30})/i,
    /at\s+(?:my\s+)?([A-Za-z][A-Za-z0-9\s.&'-]{2,30})/i,
    /to\s+(?:my\s+)?([A-Za-z][A-Za-z0-9\s.&'-]{2,30})/i,
    /(?:paid|received|bought|purchased|spent)\s+\w+\s+\w+\s+(?:for|from)\s+([A-Za-z][A-Za-z0-9\s.&'-]{2,30})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const candidate = match[1].trim();
      // Filter out common words that aren't merchants
      const stopWords = ['office', 'my', 'the', 'a', 'an', 'for', 'from', 'at', 'in', 'on', 'with', 'by'];
      if (!stopWords.includes(candidate.toLowerCase()) && candidate.length > 2) {
        return candidate;
      }
    }
  }

  // Fallback: look for capitalized words that might be merchant names
  const words = text.match(/\b[A-Z][a-z]{2,}\b/g);
  if (words && words.length > 0) {
    // Filter out common first words
    const filtered = words.filter(w => !['I', 'We', 'My', 'The', 'A', 'An', 'For', 'From', 'At', 'In', 'On', 'With', 'By', 'Paid', 'Received', 'Bought', 'Purchased', 'Spent', 'Office', 'Laptop', 'Laptops', 'Furniture', 'Rent', 'Consulting', 'Services'].includes(w));
    if (filtered.length > 0) {
      return filtered[0];
    }
    return words[0];
  }

  return null;
}

function detectEventType(text: string): EngineEventType {
  const lower = text.toLowerCase();

  if (lower.includes('refund') || lower.includes('returned')) {
    return 'REFUND';
  }
  if (lower.includes('received') || lower.includes('got paid') || lower.includes('payment received')) {
    return 'PAYMENT';
  }
  if (lower.includes('usage') || lower.includes('used') || lower.includes('consumed')) {
    return 'USAGE';
  }
  if (lower.includes('wallet load') || lower.includes('loaded wallet') || lower.includes('top up')) {
    return 'WALLET_LOAD';
  }
  if (lower.includes('wallet spend') || lower.includes('wallet purchase') || lower.includes('spent from wallet')) {
    return 'WALLET_SPEND';
  }
  if (lower.includes('marketplace') || lower.includes('sale') || lower.includes('sold')) {
    return 'MARKETPLACE_SALE';
  }
  if (lower.includes('payout') || lower.includes('paid out')) {
    return 'SELLER_PAYOUT';
  }

  // Default to purchase for pay/spend/bought
  if (lower.includes('paid') || lower.includes('spent') || lower.includes('bought') || lower.includes('purchased')) {
    return 'PURCHASE';
  }

  return 'PURCHASE';
}

function extractCategory(text: string): string | undefined {
  const patterns = [
    /for\s+(?:office\s+)?([A-Za-z][A-Za-z\s]{2,30})/i,
    /(?:office|business)\s+([A-Za-z][A-Za-z\s]{2,30})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return undefined;
}

export function parseNaturalLanguage(input: string): ParsedTransaction | null {
  const text = input.trim();
  if (!text) return null;

  const amount = parseRupeeAmount(text);
  if (amount === null || amount <= 0) return null;

  const merchant = extractMerchant(text) || 'Unknown Merchant';
  const type = detectEventType(text);
  const category = extractCategory(text);

  return { merchant, amount, type, category };
}

export function getExamples(): string[] {
  return EXAMPLES;
}