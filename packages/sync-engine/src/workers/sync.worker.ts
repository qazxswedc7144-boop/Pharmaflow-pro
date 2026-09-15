// packages/sync-engine/src/workers/sync.worker.ts
// Phase 3.4.3 Unified Sync Adapter for SyncWorker
import { DistributedSyncEngine } from "../../../../src/features/sync/sync.engine";
import { MutationQueue } from "../queue/mutationQueue";
import { NetworkMonitor } from "../monitoring/networkMonitor";

export class SyncWorker {
  private static instance: SyncWorker;
  private isPaused = false;
  private checkInterval: NodeJS.Timeout | null = null;
  private queue = MutationQueue.getInstance();
  private network = NetworkMonitor.getInstance();

  private constructor() {
    this.setupTriggers();
  }

  public static getInstance(): SyncWorker {
    if (!SyncWorker.instance) {
      SyncWorker.instance = new SyncWorker();
    }
    return SyncWorker.instance;
  }

  private setupTriggers() {
    if (typeof window === "undefined") return;

    this.network.subscribe((state) => {
      if (state.status === "ONLINE" && !this.isPaused) {
        this.triggerSync();
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && !this.isPaused) {
        this.triggerSync();
      }
    });
  }

  public start(intervalMs = 45000) {
    if (this.checkInterval) return;

    this.checkInterval = setInterval(() => {
      if (!this.isPaused) {
        this.triggerSync();
      }
    }, intervalMs);

    this.triggerSync();
  }

  public stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  public pause() {
    this.isPaused = true;
  }

  public resume() {
    this.isPaused = false;
    this.triggerSync();
  }

  /**
   * Delegate sync trigger to master DistributedSyncEngine single-flight requestSync
   */
  public triggerSync() {
    if (this.isPaused) return;

    setTimeout(() => {
      DistributedSyncEngine.getInstance().requestSync().catch((err) => {
        console.warn("[SyncWorker] Sync request delegated warning:", err);
      });
    }, 50);
  }

  public async getPendingCount(): Promise<number> {
    const pending = await this.queue.getPendingMutations();
    return pending.length;
  }
}
