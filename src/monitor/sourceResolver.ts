import { createHash } from 'crypto';
import { RpcArtifactManifest, SessionParsePlan, SessionScanCandidate } from '../types';
import { RpcArtifactStore } from '../storage/rpcArtifactStore';

const ANALYSIS_SIGNATURE_VERSION = 'analysis-v4-canonical-usage-records';

export async function resolveParsePlan(
  candidate: SessionScanCandidate,
  artifactStore?: RpcArtifactStore,
  knownManifest?: RpcArtifactManifest | null
): Promise<SessionParsePlan> {
  if (artifactStore) {
    const manifest = knownManifest ?? await artifactStore.loadManifest(candidate.sessionId);
    if (manifest?.artifactHash) {
      const tokenFilePaths = await artifactStore.getTokenFilePaths(candidate.sessionId);
      if (tokenFilePaths.length > 0) {
        return {
          sessionId: candidate.sessionId,
          sessionDir: candidate.sessionDir,
          labelHint: candidate.labelHint,
          lastModifiedMs: Math.max(candidate.lastModifiedMs, manifest.serverLastModifiedMs ?? 0),
          tokenFilePaths,
          analysisSignature: createHash('sha1').update(`${ANALYSIS_SIGNATURE_VERSION}|${candidate.signature}|${manifest.artifactHash}`).digest('hex'),
          source: 'rpc-artifact'
        };
      }
    }
  }

  return {
    sessionId: candidate.sessionId,
    sessionDir: candidate.sessionDir,
    labelHint: candidate.labelHint,
    lastModifiedMs: candidate.lastModifiedMs,
    tokenFilePaths: candidate.filePaths,
    analysisSignature: createHash('sha1').update(`${ANALYSIS_SIGNATURE_VERSION}|${candidate.signature}`).digest('hex'),
    source: 'filesystem'
  };
}
