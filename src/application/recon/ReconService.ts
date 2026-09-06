import {
  filterReconItems,
  ReconFilter,
  ReconciliationItem,
  ReconciliationRun,
  resolveReconItem,
  summarizeRecon
} from '../../domain/recon';
import { createDemoReconRun } from './demoRecon';

export class ReconService {
  static createDemo(): ReconciliationRun {
    return createDemoReconRun();
  }

  static resolve(run: ReconciliationRun, itemId: string, reason: string, resolvedAt = new Date().toISOString()): ReconciliationRun {
    return {
      ...run,
      items: run.items.map((item) => item.id === itemId ? resolveReconItem(item, reason, resolvedAt) : item)
    };
  }

  static filter(run: ReconciliationRun, filter: ReconFilter): ReconciliationItem[] {
    return filterReconItems(run.items, filter);
  }

  static summary(run: ReconciliationRun) {
    return summarizeRecon(run.items);
  }
}
