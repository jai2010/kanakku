import { Journal } from '../../domain/accounting/Journal';
import { PostedJournal } from '../../domain/accounting/PostedJournal';

export class InMemoryJournalRepository {
  private journals: Map<string, Journal> = new Map();
  private postedJournals: Map<string, PostedJournal> = new Map();

  async saveJournal(journal: Journal): Promise<void> {
    this.journals.set(journal.id, cloneJournal(journal));
  }

  async getJournal(id: string): Promise<Journal | null> {
    const journal = this.journals.get(id);
    return journal ? cloneJournal(journal) : null;
  }

  async savePostedJournal(postedJournal: PostedJournal): Promise<void> {
    this.postedJournals.set(postedJournal.id, clonePostedJournal(postedJournal));
  }

  async getPostedJournal(id: string): Promise<PostedJournal | null> {
    const postedJournal = this.postedJournals.get(id);
    return postedJournal ? clonePostedJournal(postedJournal) : null;
  }

  async findByBusinessEventId(businessEventId: string, tenantId: string): Promise<PostedJournal[]> {
    return Array.from(this.postedJournals.values())
      .filter((postedJournal) =>
        postedJournal.businessEventId === businessEventId &&
        postedJournal.tenantId === tenantId
      )
      .map((postedJournal) => clonePostedJournal(postedJournal));
  }

  async findByTenantId(tenantId: string): Promise<PostedJournal[]> {
    return Array.from(this.postedJournals.values())
      .filter((postedJournal) => postedJournal.tenantId === tenantId)
      .map((postedJournal) => clonePostedJournal(postedJournal));
  }

  async delete(id: string): Promise<void> {
    this.journals.delete(id);
    this.postedJournals.delete(id);
  }

  // For test setup
  public clear(): void {
    this.journals.clear();
    this.postedJournals.clear();
  }

  public addJournal(journal: Journal): void {
    this.journals.set(journal.id, cloneJournal(journal));
  }

  public addPostedJournal(postedJournal: PostedJournal): void {
    this.postedJournals.set(postedJournal.id, clonePostedJournal(postedJournal));
  }
}

function cloneJournalLines(lines: Journal['lines']): Journal['lines'] {
  return lines.map((line) => ({ ...line }));
}

function cloneJournal(journal: Journal): Journal {
  return {
    ...journal,
    lines: cloneJournalLines(journal.lines)
  };
}

function clonePostedJournal(postedJournal: PostedJournal): PostedJournal {
  return {
    ...postedJournal,
    lines: cloneJournalLines(postedJournal.lines)
  };
}
