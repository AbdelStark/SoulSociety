import { ReceiptLedger } from './features/receipts/ReceiptLedger';
import { useSoulTerminal } from './features/terminal/useSoulTerminal';
import { RequestWorkbench } from './features/workbench/RequestWorkbench';

export default function App() {
  const terminal = useSoulTerminal();

  return (
    <>
      <a className="skip-link" href="#workbench">Skip to request workbench</a>
      <header className="masthead">
        <a className="wordmark" href="#top" aria-label="Soul Society home">
          <span aria-hidden="true">SS</span>
          <strong>Soul Society</strong>
        </a>
        <nav aria-label="Primary">
          <a href="#workbench">Workbench</a>
          <a href="#receipts">Receipts</a>
          <a href="#boundary">Claim boundary</a>
        </nav>
        <div className="masthead__status">
          <span
            className={terminal.ready ? 'signal signal--ready' : 'signal'}
            aria-hidden="true"
          />
          {terminal.ready ? 'local verifier ready' : 'setup incomplete'}
        </div>
      </header>

      <main id="top">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero__copy">
            <p className="kicker">Soul Wire v1 / proof-carrying requests</p>
            <h1 id="hero-title">Ask the network.<br /><em>Verify here.</em></h1>
            <p className="hero__lede">
              Sign a bounded Cairo job over Nostr, authenticate the provider result,
              fetch its content-addressed STWO proof, and verify it in this browser.
            </p>
            <a className="arrow-link" href="#workbench">
              Open the field terminal <span aria-hidden="true">↘</span>
            </a>
          </div>
          <aside className="hero__diagram" aria-label="Protocol sequence">
            <p>One request. Four trust boundaries.</p>
            <ol>
              <li><span>01</span><strong>Sign</strong><small>NIP-07 keeps the key outside this app.</small></li>
              <li><span>02</span><strong>Relay</strong><small>Requests and results remain public Nostr events.</small></li>
              <li><span>03</span><strong>Bind</strong><small>Kind, tags, statement, digest, and request ID must agree.</small></li>
              <li><span>04</span><strong>Verify</strong><small>Reviewed program hash plus local STWO verification.</small></li>
            </ol>
          </aside>
        </section>

        <div className="protocol-band" aria-label="Current protocol identifiers">
          <span>protocol <code>soul-society/1</code></span>
          <span>program <code>soul-cairo-v1</code></span>
          <span>channel <code>blake2s</code></span>
          <span>proof <code>stwo-cairo-json-v1</code></span>
        </div>

        <RequestWorkbench
          ready={terminal.ready}
          relayConfig={terminal.relayConfig}
          providerConfig={terminal.providerConfig}
          publicKey={terminal.publicKey}
          signerError={terminal.signerError}
          verifierState={terminal.verifierState}
          connectSigner={terminal.connectSigner}
          submitInput={terminal.submitInput}
        />
        <ReceiptLedger jobs={terminal.jobs} />

        <section className="boundary" id="boundary" aria-labelledby="boundary-title">
          <p className="kicker">Read before relying / 003</p>
          <div>
            <h2 id="boundary-title">A proof narrows trust.<br />It does not erase it.</h2>
            <div className="boundary__copy">
              <p>
                A verified receipt means the downloaded proof matched its signed digest and the local
                verifier accepted the bound statement for the reviewed Cairo program hash.
              </p>
              <p>
                It does not prove provider availability, payment settlement, input privacy, useful
                semantics beyond that program, witness hiding, zero knowledge, or production
                readiness. Soul Wire is an application-specific protocol; it does not claim
                NIP-90 compliance.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <strong>Soul Society</strong>
        <p>Research-alpha software for inspectable, locally verified computation.</p>
        <a href="#top">Back to top ↑</a>
      </footer>
    </>
  );
}
