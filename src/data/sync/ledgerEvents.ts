type LedgerListener = () => void;

const listeners = new Set<LedgerListener>();

/** UI hooks register here to reload local SQLite after a peer-driven pull. */
export function onLedgerUpdated(listener: LedgerListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitLedgerUpdated(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch (error) {
      console.warn('[sync] ledger listener failed', error);
    }
  }
}
