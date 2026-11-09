import { ObservationError } from '../rpc.ts';

export const unavailabilityReasons = [
  'rpc_unavailable',
  'database_unavailable',
  'indexer_unavailable',
  'indexer_not_ready',
  'startup_catchup',
  'checkpoint_unavailable',
  'checkpoint_not_eligible',
  'checkpoint_hash_mismatch',
  'persisted_scope_mismatch',
  'chain_changed_during_read',
  'observation_unavailable',
] as const;

const knownReasons = new Set<string>(unavailabilityReasons);

export function unavailabilityReason(error: unknown) {
  if (error instanceof ObservationError && knownReasons.has(error.code)) {
    return error.code;
  }
  return 'observation_unavailable';
}
