import { useState } from 'react';
import { ServiceType, feltFromNumber, type JobInput } from '@soul-society/sdk';

import type {
  ProviderConfig,
  RelayConfig,
  VerifierLoadState,
} from '../terminal/useSoulTerminal';
import { shortHex } from '../../lib/format';
import { buildInput, EMPTY_FORM, SERVICES, type FormValues } from './catalog';

type RequestWorkbenchProps = {
  ready: boolean;
  relayConfig: RelayConfig;
  providerConfig: ProviderConfig;
  publicKey?: string;
  signerError?: string;
  verifierState: VerifierLoadState;
  connectSigner: () => Promise<void>;
  submitInput: (input: JobInput) => void;
};

function RequestFields({
  service,
  form,
  onChange,
}: {
  service: ServiceType;
  form: FormValues;
  onChange: (field: keyof FormValues, value: string) => void;
}) {
  const feltHint = `Exactly 0x + 64 lowercase hex digits; value below Cairo's field prime. Example: ${feltFromNumber(1)}`;

  if (service === ServiceType.Fibonacci) {
    return (
      <div className="field-grid field-grid--single">
        <label className="field" htmlFor="fibonacci-n">
          <span className="field__label">Index n</span>
          <input
            id="fibonacci-n"
            name="n"
            type="number"
            min="0"
            max="363"
            step="1"
            inputMode="numeric"
            value={form.n}
            onChange={(event) => onChange('n', event.target.value)}
            aria-describedby="fibonacci-hint"
            required
          />
          <small id="fibonacci-hint">Integer, 0–363. Fibonacci(364) exceeds the Cairo field.</small>
        </label>
      </div>
    );
  }

  if (service === ServiceType.HashVerify) {
    return (
      <div className="field-grid">
        <label className="field" htmlFor="expected-hash">
          <span className="field__label">Expected Poseidon hash</span>
          <input
            id="expected-hash"
            name="hash"
            type="text"
            dir="ltr"
            spellCheck={false}
            autoComplete="off"
            maxLength={66}
            placeholder={feltFromNumber(42)}
            value={form.hash}
            onChange={(event) => onChange('hash', event.target.value)}
            aria-describedby="felt-hint"
            required
          />
        </label>
        <label className="field" htmlFor="preimage">
          <span className="field__label">Preimage witness</span>
          <input
            id="preimage"
            name="preimage"
            type="text"
            dir="ltr"
            spellCheck={false}
            autoComplete="off"
            maxLength={66}
            placeholder={feltFromNumber(7)}
            value={form.preimage}
            onChange={(event) => onChange('preimage', event.target.value)}
            aria-describedby="felt-hint witness-warning"
            required
          />
        </label>
        <small id="felt-hint" className="field-grid__hint">{feltHint}</small>
      </div>
    );
  }

  return (
    <div className="field-grid">
      <label className="field" htmlFor="merkle-root">
        <span className="field__label">Merkle root</span>
        <input
          id="merkle-root"
          name="root"
          type="text"
          dir="ltr"
          spellCheck={false}
          autoComplete="off"
          maxLength={66}
          placeholder={feltFromNumber(9)}
          value={form.root}
          onChange={(event) => onChange('root', event.target.value)}
          aria-describedby="merkle-felt-hint"
          required
        />
      </label>
      <label className="field" htmlFor="merkle-leaf">
        <span className="field__label">Leaf</span>
        <input
          id="merkle-leaf"
          name="leaf"
          type="text"
          dir="ltr"
          spellCheck={false}
          autoComplete="off"
          maxLength={66}
          placeholder={feltFromNumber(3)}
          value={form.leaf}
          onChange={(event) => onChange('leaf', event.target.value)}
          aria-describedby="merkle-felt-hint"
          required
        />
      </label>
      <label className="field field--wide" htmlFor="merkle-path">
        <span className="field__label">Sibling path</span>
        <textarea
          id="merkle-path"
          name="proof"
          dir="ltr"
          spellCheck={false}
          autoComplete="off"
          rows={5}
          maxLength={32 * 67}
          placeholder={`${feltFromNumber(4)}\n${feltFromNumber(8)}`}
          value={form.proof}
          onChange={(event) => onChange('proof', event.target.value)}
          aria-describedby="merkle-felt-hint witness-warning"
        />
      </label>
      <label className="field" htmlFor="merkle-index">
        <span className="field__label">Leaf index</span>
        <input
          id="merkle-index"
          name="index"
          type="number"
          min="0"
          step="1"
          inputMode="numeric"
          value={form.index}
          onChange={(event) => onChange('index', event.target.value)}
          required
        />
      </label>
      <small id="merkle-felt-hint" className="field-grid__hint">
        {feltHint} One sibling per line, at most 32.
      </small>
    </div>
  );
}

export function RequestWorkbench({
  ready,
  relayConfig,
  providerConfig,
  publicKey,
  signerError,
  verifierState,
  connectSigner,
  submitInput,
}: RequestWorkbenchProps) {
  const [service, setService] = useState<ServiceType>(ServiceType.Fibonacci);
  const [form, setForm] = useState<FormValues>(EMPTY_FORM);
  const [formError, setFormError] = useState<string>();
  const selected = SERVICES.find((candidate) => candidate.id === service) ?? SERVICES[0];

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);
    try {
      submitInput(buildInput(service, form));
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'The request could not be prepared.');
    }
  }

  return (
    <section className="workbench" id="workbench" aria-labelledby="workbench-title">
      <header className="section-heading">
        <p className="kicker">Live protocol terminal / 04</p>
        <h2 id="workbench-title">Issue a proof-carrying request</h2>
        <p>
          The public site loads the local verifier. Publishing also requires your
          NIP-07 signer, a reviewed provider key, and an operational relay.
          Nothing leaves the browser until the signer shows the exact event.
        </p>
      </header>

      <div className="workbench__layout">
        <aside className="service-index" aria-label="Choose a Cairo service">
          {SERVICES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={service === item.id ? 'service-index__item is-active' : 'service-index__item'}
              onClick={() => {
                setService(item.id);
                setFormError(undefined);
              }}
              aria-pressed={service === item.id}
            >
              <span>{item.index}</span>
              <strong>{item.label}</strong>
              <small>{item.eyebrow}</small>
            </button>
          ))}
        </aside>

        <form className="request-form" onSubmit={submit} noValidate>
          <header className="request-form__header">
            <div>
              <p className="kicker">{selected.index} / {selected.eyebrow}</p>
              <h3>{selected.label}</h3>
            </div>
            <p>{selected.summary}</p>
          </header>

          <RequestFields
            service={service}
            form={form}
            onChange={(field, value) => setForm((current) => ({ ...current, [field]: value }))}
          />

          <div className="witness-warning" id="witness-warning">
            <strong>Public transport warning</strong>
            <p>
              Nostr relay events are not private. Hash preimages and Merkle paths are omitted
              from the public proof statement, but they are still visible in the request event.
              This STWO configuration is not presented as zero-knowledge or witness-hiding.
            </p>
          </div>

          <div className="system-checks" aria-label="Local readiness">
            <div>
              <span>Signer</span>
              {publicKey ? (
                <code dir="ltr" title={publicKey}>{shortHex(publicKey, 9)}</code>
              ) : (
                <button type="button" className="text-button" onClick={() => void connectSigner()}>
                  Use NIP-07 signer
                </button>
              )}
            </div>
            <div role="status" aria-live="polite" aria-atomic="true">
              <span>Verifier</span>
              {verifierState.status === 'ready' ? (
                <code dir="ltr" title={verifierState.manifest.program_hash}>
                  {shortHex(verifierState.manifest.program_hash, 9)}
                </code>
              ) : verifierState.status === 'loading' ? (
                <em>loading reviewed build…</em>
              ) : verifierState.status === 'idle' ? (
                <em>loads as terminal approaches</em>
              ) : (
                <em>unavailable</em>
              )}
            </div>
            <div>
              <span>Relays</span>
              <code dir="ltr">{relayConfig.relays.length || 'invalid'}</code>
            </div>
            <div>
              <span>Trusted providers</span>
              <code
                dir="ltr"
                title={providerConfig.pubkeys.join(', ')}
              >
                {providerConfig.pubkeys.length || 'missing'}
              </code>
            </div>
          </div>

          {signerError ? <p className="form-error" role="alert">{signerError}</p> : null}
          {verifierState.status === 'error' ? (
            <p className="form-error" role="alert">
              {verifierState.message} Generate and review the real WASM artifacts before using the terminal.
            </p>
          ) : null}
          {relayConfig.error ? <p className="form-error" role="alert">{relayConfig.error}</p> : null}
          {providerConfig.error ? (
            <p className="form-error" role="alert">{providerConfig.error}</p>
          ) : null}
          {formError ? <p className="form-error" role="alert">{formError}</p> : null}

          <footer className="request-form__footer">
            <p>
              Destination: {relayConfig.relays.length
                ? relayConfig.relays.map((relay) => <code dir="ltr" key={relay}>{relay}</code>)
                : 'no valid relay'}
            </p>
            <button className="primary-action" type="submit" disabled={!ready}>
              Review & sign request <span aria-hidden="true">→</span>
            </button>
          </footer>
        </form>
      </div>
    </section>
  );
}
