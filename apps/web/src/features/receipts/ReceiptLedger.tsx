import type { JobLifecycleState } from '@soul-society/sdk';

import type { JobRecord } from '../terminal/useSoulTerminal';
import { shortHex } from '../../lib/format';

const STAGES: JobLifecycleState[] = [
  'publishing',
  'awaiting_result',
  'result_received',
  'fetching',
  'verifying',
  'verified',
];

const STATE_COPY: Record<JobLifecycleState, string> = {
  draft: 'Draft',
  publishing: 'Signing & publishing',
  awaiting_result: 'Awaiting provider result',
  result_received: 'Result authenticated',
  fetching: 'Fetching proof by digest',
  verifying: 'Verifying locally',
  verified: 'Locally verified',
  failed: 'Stopped',
};

function statePosition(state: JobLifecycleState): number {
  return state === 'draft' || state === 'failed' ? -1 : STAGES.indexOf(state);
}

function JobTimeline({ record }: { record: JobRecord }) {
  const { snapshot, job } = record;
  const position = statePosition(snapshot.state);
  const success = snapshot.result?.content.status === 'success'
    ? snapshot.result.content
    : undefined;

  return (
    <article className="job" aria-labelledby={`job-${record.key}`}>
      <header className="job__header">
        <div>
          <p className="kicker">{snapshot.input.type.replaceAll('_', ' ')}</p>
          <h3 id={`job-${record.key}`}>{STATE_COPY[snapshot.state]}</h3>
        </div>
        <span className={`state-stamp state-stamp--${snapshot.state}`} aria-live="polite">
          {snapshot.state}
        </span>
      </header>

      <ol className="stage-rail" aria-label="Verification lifecycle">
        {STAGES.map((stage, index) => (
          <li
            key={stage}
            data-state={
              snapshot.state === 'failed'
                ? 'idle'
                : index < position
                  ? 'done'
                  : index === position
                    ? 'current'
                    : 'idle'
            }
          >
            <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            {STATE_COPY[stage]}
          </li>
        ))}
      </ol>

      <dl className="job__facts">
        <div>
          <dt>Request</dt>
          <dd dir="ltr" title={snapshot.request?.event.id}>
            {snapshot.request ? shortHex(snapshot.request.event.id, 10) : 'not signed yet'}
          </dd>
        </div>
        <div>
          <dt>Relay publish</dt>
          <dd>{snapshot.publishAttempt ? `attempt ${snapshot.publishAttempt}` : 'not started'}</dd>
        </div>
        <div>
          <dt>Proof fetch</dt>
          <dd>{snapshot.proofAttempt ? `attempt ${snapshot.proofAttempt}` : 'not started'}</dd>
        </div>
      </dl>

      {snapshot.failure ? (
        <div className="job__notice job__notice--error" role="alert">
          <strong>{snapshot.failure.code.replaceAll('_', ' ')}</strong>
          <p>{snapshot.failure.message}</p>
        </div>
      ) : null}

      {success ? (
        <div className="receipt">
          <div>
            <span>Provider output</span>
            <code dir="ltr">{JSON.stringify(success.statement.output)}</code>
          </div>
          <div>
            <span>Program hash</span>
            <code dir="ltr" title={success.proof.program_hash}>
              {shortHex(success.proof.program_hash, 12)}
            </code>
          </div>
          <div>
            <span>Proof digest</span>
            <code dir="ltr" title={success.proof.sha256}>
              {shortHex(success.proof.sha256, 12)}
            </code>
          </div>
          <div>
            <span>Provider timings</span>
            <code>
              {success.metrics.execution_ms} / {success.metrics.proving_ms} / {success.metrics.verification_ms} ms
            </code>
          </div>
        </div>
      ) : null}

      <div className="job__actions">
        {!['verified', 'failed'].includes(snapshot.state) ? (
          <button type="button" className="text-button" onClick={() => job.cancel()}>
            Cancel local wait
          </button>
        ) : null}
        {snapshot.state === 'failed' && snapshot.failure?.retryable ? (
          <button
            type="button"
            className="text-button"
            onClick={() => void job.retry().catch(() => undefined)}
          >
            Retry as a new signed request
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function ReceiptLedger({ jobs }: { jobs: JobRecord[] }) {
  return (
    <section className="receipts" id="receipts" aria-labelledby="receipts-title">
      <header className="section-heading section-heading--split">
        <div>
          <p className="kicker">Client-side evidence / 05</p>
          <h2 id="receipts-title">Verification receipts</h2>
        </div>
        <p>
          Status advances only when a real event, artifact, or verifier result crosses its boundary.
          Provider timings are reported metadata, not proof claims.
        </p>
      </header>

      {jobs.length ? (
        <div className="job-list">
          {jobs.map((record) => <JobTimeline key={record.key} record={record} />)}
        </div>
      ) : (
        <div className="empty-ledger">
          <span aria-hidden="true">∅</span>
          <div>
            <h3>No local receipts yet</h3>
            <p>Submit a request above. This ledger does not seed demonstrations or pretend a provider is online.</p>
          </div>
        </div>
      )}
    </section>
  );
}
