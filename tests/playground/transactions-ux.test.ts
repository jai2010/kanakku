import { EngineService } from '../../src/application/playground/EngineService';
import {
  filterActivityTransactions,
  filterParticipants,
  matchesParticipantQuery,
  matchesTransactionQuery,
  participantBalanceLabel,
  participantCounts,
  participantTypeLabel
} from '../../app/transactions-model';

describe('Transactions UX model', () => {
  async function seeded() {
    return EngineService.createLive().seedDemo();
  }

  it('labels operational balances in business language', () => {
    expect(participantBalanceLabel('BUYER')).toBe('Wallet');
    expect(participantBalanceLabel('SELLER')).toBe('Eligible payout');
    expect(participantTypeLabel('BUYER')).toBe('Buyer');
    expect(participantTypeLabel('SELLER')).toBe('Seller');
  });

  it('counts buyers and sellers without assuming a card grid', async () => {
    const snapshot = await seeded();
    expect(participantCounts(snapshot.participants)).toEqual({ buyers: 3, sellers: 3 });
  });

  it('finds transactions by participant, id, order, and amount', async () => {
    const snapshot = await seeded();
    const acme = snapshot.transactions.filter((row) => matchesTransactionQuery(row, 'Acme'));
    expect(acme.some((row) => row.orderId === 'ORD-1001')).toBe(true);
    const byOrder = snapshot.transactions.filter((row) => matchesTransactionQuery(row, 'ORD-1001'));
    expect(byOrder).toHaveLength(1);
    const byAmount = filterActivityTransactions(snapshot.transactions, { kind: 'ALL', query: '₹10,000' });
    expect(byAmount.some((row) => row.amount === 10000)).toBe(true);
    const wallet = filterActivityTransactions(snapshot.transactions, { kind: 'Wallet', query: '' });
    expect(wallet.every((row) => row.type === 'WALLET_LOAD' || row.type === 'WALLET_SPEND')).toBe(true);
    const sales = filterActivityTransactions(snapshot.transactions, { kind: 'Marketplace Sales', query: '' });
    expect(sales.every((row) => row.type === 'MARKETPLACE_SALE')).toBe(true);
  });

  it('finds participants by name and id in a flat directory', async () => {
    const snapshot = await seeded();
    expect(snapshot.participants.filter((row) => matchesParticipantQuery(row, 'B001')).map((row) => row.name)).toEqual(['Priya']);
    expect(filterParticipants(snapshot.participants, { kind: 'SELLER', query: 'Acme' }).map((row) => row.participantId)).toEqual(['S001']);
    expect(filterParticipants(snapshot.participants, { kind: 'BUYER', query: '' })).toHaveLength(3);
  });
});
