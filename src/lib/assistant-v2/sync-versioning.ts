/**
 * Client-side sync request versioning — ignore stale sync responses (Sprint 13D.2).
 */
export type SyncVersionTracker = {
  beginSync: () => number;
  isCurrent: (version: number) => boolean;
  getLatest: () => number;
};

export function createSyncVersionTracker(): SyncVersionTracker {
  let latestVersion = 0;

  return {
    beginSync() {
      latestVersion += 1;
      return latestVersion;
    },
    isCurrent(version: number) {
      return version === latestVersion;
    },
    getLatest() {
      return latestVersion;
    },
  };
}
