import { useState } from 'react';

import proofSpecimen from './proofSpecimen.json';

const REPOSITORY_URL = 'https://github.com/AbdelStark/SoulSociety';
const PROGRAM_HASH = proofSpecimen.program_hash;
const EXECUTABLE_SHA = proofSpecimen.executable_sha256;
const PROOF_SHA = proofSpecimen.proof_sha256;

const navigation = [
  { href: '#protocol', label: 'Protocol' },
  { href: '#evidence', label: 'Evidence' },
  { href: '#services', label: 'Services' },
  { href: '#workbench', label: 'Terminal' },
  { href: '#developers', label: 'Build' },
];

function Brand() {
  return (
    <a className="wordmark" href="#top" aria-label="Soul Society home">
      <span className="wordmark__seal" aria-hidden="true">
        <i />
        <b>SS</b>
      </span>
      <span className="wordmark__name">
        <strong>Soul Society</strong>
        <small>Proof-carrying computation</small>
      </span>
    </a>
  );
}

type VerifierStatus = 'idle' | 'loading' | 'ready' | 'error';

const verifierStatusCopy: Record<VerifierStatus, string> = {
  idle: 'verifier on demand',
  loading: 'loading verifier',
  ready: 'verifier loaded',
  error: 'verifier unavailable',
};

export function SiteHeader({ verifierStatus }: { verifierStatus: VerifierStatus }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="site-header">
      <div className="masthead">
        <Brand />

        <nav className="desktop-nav" aria-label="Primary navigation">
          {navigation.map((item) => (
            <a key={item.href} href={item.href}>{item.label}</a>
          ))}
        </nav>

        <div className="masthead__actions">
          <span
            className="masthead__status"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <span
              className={
                verifierStatus === 'ready'
                  ? 'signal signal--ready'
                  : verifierStatus === 'error'
                    ? 'signal signal--error'
                    : 'signal'
              }
              aria-hidden="true"
            />
            {verifierStatusCopy[verifierStatus]}
          </span>
          <a
            className="source-link"
            href={REPOSITORY_URL}
            target="_blank"
            rel="noreferrer"
          >
            GitHub <span aria-hidden="true">↗</span>
          </a>
          <details
            className="mobile-menu"
            open={mobileMenuOpen}
            onToggle={(event) => setMobileMenuOpen(event.currentTarget.open)}
          >
            <summary aria-label={mobileMenuOpen ? 'Close navigation' : 'Open navigation'}>
              {mobileMenuOpen ? 'Close' : 'Menu'}
            </summary>
            <nav aria-label="Mobile navigation">
              {navigation.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {item.label}
                </a>
              ))}
              <a
                href={REPOSITORY_URL}
                target="_blank"
                rel="noreferrer"
                onClick={() => setMobileMenuOpen(false)}
              >
                GitHub <span aria-hidden="true">↗</span>
              </a>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}

function ProofMap() {
  return (
    <svg
      className="proof-map"
      viewBox="0 0 580 205"
      role="img"
      aria-labelledby="proof-map-title proof-map-description"
    >
      <title id="proof-map-title">Proof verification path</title>
      <desc id="proof-map-description">
        A signed request crosses an untrusted relay, is proven by a Cairo provider,
        and is accepted only after local browser verification.
      </desc>
      <path className="proof-map__line" d="M35 102H545" />
      <path className="proof-map__trace" d="M35 102C116 102 116 42 197 42S278 162 359 162 440 102 545 102" />
      <g transform="translate(35 102)">
        <circle r="13" />
        <text x="0" y="36">sign</text>
      </g>
      <g transform="translate(197 42)">
        <circle r="13" />
        <text x="0" y="-25">relay</text>
      </g>
      <g transform="translate(359 162)">
        <circle r="13" />
        <text x="0" y="38">prove</text>
      </g>
      <g transform="translate(545 102)">
        <circle className="proof-map__verified" r="16" />
        <path d="m-6 0 4 4 9-10" />
        <text x="0" y="38">verify</text>
      </g>
    </svg>
  );
}

function ProofSpecimen() {
  return (
    <aside className="proof-specimen" aria-label="Canonical STWO proof specimen">
      <header className="proof-specimen__header">
        <span>Canonical fixture / 0001</span>
        <span className="verified-label"><i aria-hidden="true" /> self-verified</span>
      </header>

      <ProofMap />

      <div className="proof-specimen__statement">
        <span>Reviewed statement</span>
        <strong>F({proofSpecimen.statement.input}) = {proofSpecimen.statement.output}</strong>
        <small>Cairo execution · STWO / Blake2s</small>
      </div>

      <dl className="proof-specimen__facts">
        <div>
          <dt>Program</dt>
          <dd>{proofSpecimen.program}</dd>
        </div>
        <div>
          <dt>Proof size</dt>
          <dd>{proofSpecimen.proof_size.toLocaleString('en-US')} bytes</dd>
        </div>
        <div>
          <dt>Program hash</dt>
          <dd title={PROGRAM_HASH}>{PROGRAM_HASH.slice(0, 18)}…</dd>
        </div>
        <div>
          <dt>Proof SHA-256</dt>
          <dd title={PROOF_SHA}>{PROOF_SHA.slice(0, 18)}…</dd>
        </div>
      </dl>

      <footer className="proof-specimen__footer">
        <span>Real fixture, not a benchmark</span>
        <a
          href={`${REPOSITORY_URL}/blob/main/protocol/programs.json`}
          target="_blank"
          rel="noreferrer"
        >
          Inspect trust manifest <span aria-hidden="true">↗</span>
        </a>
      </footer>
    </aside>
  );
}

export function Hero() {
  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero__copy">
          <div className="hero__eyebrow">
            <span>Research alpha</span>
            <span>Soul Wire v1</span>
            <span>MIT licensed</span>
          </div>
          <h1 id="hero-title">
            Don’t trust the worker.
            <em>Verify the computation.</em>
          </h1>
          <p className="hero__lede">
            Signed Nostr requests go in. A pinned Cairo program and a STWO proof
            come back. Your browser makes the final decision.
          </p>
          <div className="hero__actions">
            <a className="button button--ink" href="#workbench">
              Open the verification terminal <span aria-hidden="true">↓</span>
            </a>
            <a
              className="arrow-link"
              href={`${REPOSITORY_URL}/blob/main/docs/architecture.md`}
              target="_blank"
              rel="noreferrer"
            >
              Inspect the architecture <span aria-hidden="true">↗</span>
            </a>
          </div>
          <ul className="hero__notes" aria-label="Project principles">
            <li><span>01</span> Provider treated as untrusted</li>
            <li><span>02</span> Program identity pinned locally</li>
            <li><span>03</span> Native and WASM verification</li>
          </ul>
        </div>
        <ProofSpecimen />
      </section>

      <div className="protocol-band" aria-label="Current protocol identifiers">
        <span>protocol <code>soul-society/1</code></span>
        <span>program <code>soul-cairo-v1</code></span>
        <span>security profile <code>targets 96 conjectured bits</code></span>
        <span>proof <code>stwo-cairo-json-v1</code></span>
      </div>
    </>
  );
}

const flow = [
  {
    index: '01',
    title: 'Sign',
    copy: 'A typed Soul Wire request is reviewed and signed through NIP-07. The page never receives your signing key.',
    meta: 'request event · authenticated',
  },
  {
    index: '02',
    title: 'Relay',
    copy: 'Nostr coordinates requests and signed results. The relay remains transport—not an oracle and not a trust root.',
    meta: 'public transport · untrusted',
  },
  {
    index: '03',
    title: 'Execute',
    copy: 'The provider validates bounds, runs the pinned Cairo executable, generates a STWO proof, and verifies it natively.',
    meta: 'Cairo VM · bounded intake',
  },
  {
    index: '04',
    title: 'Bind',
    copy: 'The result binds request, statement, program hash, proof format, size, digest, and immutable artifact URL.',
    meta: 'signed descriptor · SHA-256',
  },
  {
    index: '05',
    title: 'Verify',
    copy: 'The client authenticates, fetches by digest, checks the exact bytes, and verifies proof, program, and statement in WASM.',
    meta: 'local acceptance · explicit',
  },
];

export function ProtocolOverview() {
  return (
    <section className="protocol-overview" id="protocol" aria-labelledby="protocol-title">
      <header className="editorial-heading">
        <p className="kicker">The protocol / 01</p>
        <div>
          <h2 id="protocol-title">The network can carry a claim.<br />Only proof earns acceptance.</h2>
          <p>
            Decentralized transport removes a gatekeeper from publishing. It does
            not make remote computation true. Soul Society keeps coordination
            permissionless and moves the acceptance decision to the client.
          </p>
        </div>
      </header>

      <ol className="protocol-flow">
        {flow.map((step) => (
          <li key={step.index}>
            <span className="protocol-flow__index">{step.index}</span>
            <div>
              <h3>{step.title}</h3>
              <p>{step.copy}</p>
              <small>{step.meta}</small>
            </div>
          </li>
        ))}
      </ol>

      <blockquote className="thesis-quote">
        <p>“The relay coordinates. The provider computes. The client decides.”</p>
        <footer>Soul Society’s architectural rule</footer>
      </blockquote>
    </section>
  );
}

const checks = [
  {
    title: 'Authenticated request',
    copy: 'Event ID, Schnorr signature, kind, service, canonical content, ordered tags, freshness, expiry, and bounds must agree.',
    label: 'before compute',
  },
  {
    title: 'Pinned computation',
    copy: 'The Cairo executable digest and proven program hash must match the independently reviewed trust manifest.',
    label: 'before trust',
  },
  {
    title: 'Content-addressed proof',
    copy: 'The relay carries only a signed descriptor. The browser enforces artifact URL policy, byte count, and SHA-256.',
    label: 'before parse',
  },
  {
    title: 'Local acceptance',
    copy: 'WASM requires the reviewed verifier profile, verifies STWO, then compares the exact public input and output.',
    label: 'before verified',
  },
];

export function EvidenceSection() {
  return (
    <section className="evidence-section" id="evidence" aria-labelledby="evidence-title">
      <div className="evidence-section__inner">
        <header className="evidence-heading">
          <p className="kicker kicker--light">Verification surface / 02</p>
          <h2 id="evidence-title">Every boundary must close.</h2>
          <p>
            “Verified” is not a loading state. It appears only after a signed
            result, a hash-bound artifact, and the local STWO verifier all agree.
          </p>
        </header>

        <div className="evidence-grid">
          {checks.map((check, index) => (
            <article key={check.title}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <h3>{check.title}</h3>
              <p>{check.copy}</p>
              <small>{check.label}</small>
            </article>
          ))}
        </div>

        <div className="rejection-rail">
          <span>Negative tests reject</span>
          <ul>
            <li>mutated proof bytes</li>
            <li>wrong program identity</li>
            <li>changed public input</li>
            <li>changed public output</li>
            <li>weakened proof profile</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

const services = [
  {
    index: '01',
    title: 'Fibonacci',
    copy: 'Compute F(n), with n and the result bound into the public proof statement.',
    statement: 'public: n → F(n)',
    witness: 'witness: none',
    kinds: '5601 / 6601',
  },
  {
    index: '02',
    title: 'Poseidon hash check',
    copy: 'Prove whether one Cairo field preimage matches an expected Poseidon hash.',
    statement: 'public: hash → valid',
    witness: 'witness: preimage',
    kinds: '5602 / 6602',
  },
  {
    index: '03',
    title: 'Merkle membership',
    copy: 'Prove whether a leaf and index open to a Poseidon Merkle root at depth 32 or less.',
    statement: 'public: root + leaf + index → valid',
    witness: 'witness: sibling path',
    kinds: '5603 / 6603',
  },
];

export function ServicesSection() {
  return (
    <section className="services-showcase" id="services" aria-labelledby="services-title">
      <header className="editorial-heading editorial-heading--compact">
        <p className="kicker">Reviewed services / 03</p>
        <div>
          <h2 id="services-title">Three computations.<br />One pinned program.</h2>
          <p>
            These are reference services for exercising the proof boundary—not
            a production marketplace. Cairo remains the computation authority.
          </p>
        </div>
      </header>

      <div className="service-ledger">
        {services.map((service) => (
          <article key={service.index}>
            <span className="service-ledger__index">{service.index}</span>
            <div className="service-ledger__copy">
              <h3>{service.title}</h3>
              <p>{service.copy}</p>
            </div>
            <dl>
              <div>
                <dt>Statement</dt>
                <dd>{service.statement}</dd>
              </div>
              <div>
                <dt>Cairo ABI</dt>
                <dd>{service.witness}</dd>
              </div>
              <div>
                <dt>Event kinds</dt>
                <dd>{service.kinds}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
      <p className="services-note">
        Witness separation in the Cairo ABI is not a privacy claim. Current Soul
        Wire requests transport hash preimages and Merkle paths in cleartext.
      </p>
    </section>
  );
}

export function TrustBoundary() {
  return (
    <section className="boundary" id="boundary" aria-labelledby="boundary-title">
      <p className="kicker">Claim boundary / 06</p>
      <div className="boundary__intro">
        <h2 id="boundary-title">Proof narrows trust.<br />It does not erase it.</h2>
        <p>
          A verified receipt establishes one deliberate fact: under the implemented
          verifier and its cryptographic assumptions, the locally trusted Cairo
          program produced the declared output from the declared input.
        </p>
      </div>

      <div className="boundary-ledger">
        <article>
          <h3>What local verification checks</h3>
          <ul>
            <li>signed request and signed provider result</li>
            <li>explicit provider-author allowlist</li>
            <li>artifact length and SHA-256 digest</li>
            <li>reviewed proof parameters and preprocessing</li>
            <li>STWO proof, program identity, and exact statement</li>
          </ul>
        </article>
        <article>
          <h3>What it does not establish</h3>
          <ul>
            <li>provider or relay availability</li>
            <li>payment, pricing, reputation, or settlement</li>
            <li>privacy, zero knowledge, or witness hiding</li>
            <li>program intent beyond reviewed semantics</li>
            <li>independent audit or production readiness</li>
          </ul>
        </article>
      </div>

      <div className="boundary-faq">
        <details>
          <summary>Is Soul Society zero-knowledge?</summary>
          <p>
            No. Private inputs are separated in the Cairo ABI, but this release
            makes no witness-hiding claim, and current requests expose witnesses
            to relays. Use test data only.
          </p>
        </details>
        <details>
          <summary>Is this NIP-90?</summary>
          <p>
            No. Soul Wire v1 is a strict application microstandard with its own
            protocol identifier. It borrows the request/result kind shape without
            claiming NIP-90 compliance.
          </p>
        </details>
        <details>
          <summary>What must the client still trust?</summary>
          <p>
            The reviewed Cairo source and manifest, the verifier build and pinned
            dependencies, its browser origin and signer, configured provider keys
            for result authorization, and the underlying cryptographic assumptions.
          </p>
        </details>
      </div>

      <a
        className="arrow-link"
        href={`${REPOSITORY_URL}/blob/main/docs/security-model.md`}
        target="_blank"
        rel="noreferrer"
      >
        Read the complete security model <span aria-hidden="true">↗</span>
      </a>
    </section>
  );
}

const developerLinks = [
  {
    title: 'Architecture',
    copy: 'Modules, seams, trust transitions, and end-to-end invariants.',
    href: `${REPOSITORY_URL}/blob/main/docs/architecture.md`,
  },
  {
    title: 'Soul Wire v1',
    copy: 'Canonical events, kinds, bounds, proof descriptors, and versioning.',
    href: `${REPOSITORY_URL}/blob/main/docs/protocol.md`,
  },
  {
    title: 'TypeScript SDK',
    copy: 'Signer, relay transport, job lifecycle, artifact fetch, and verification.',
    href: `${REPOSITORY_URL}/tree/main/packages/soul-sdk`,
  },
  {
    title: 'Add a service',
    copy: 'Extend the Cairo program, Rust protocol, fixtures, SDK, and UI safely.',
    href: `${REPOSITORY_URL}/blob/main/docs/adding-a-service.md`,
  },
];

function CopyCommandButton() {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText('./scripts/run-local.sh');
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
  }

  const label =
    copyState === 'copied'
      ? 'Copied'
      : copyState === 'error'
        ? 'Copy failed'
        : 'Copy';
  const statusMessage =
    copyState === 'copied'
      ? 'Local stack command copied.'
      : copyState === 'error'
        ? 'The local stack command could not be copied.'
        : '';

  return (
    <>
      <button
        type="button"
        onClick={() => void copyCommand()}
        aria-label="Copy local stack command"
      >
        {label}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {statusMessage}
      </span>
    </>
  );
}

export function DeveloperSection() {
  return (
    <section className="developer-section" id="developers" aria-labelledby="developers-title">
      <div className="developer-section__intro">
        <p className="kicker">Build from source / 07</p>
        <h2 id="developers-title">Run the whole trust path.</h2>
        <p>
          Start a pinned relay, provider, artifact endpoint, and browser client.
          The first build compiles Cairo, STWO, Rust, and the WASM verifier.
        </p>
        <div className="command-block" aria-label="Local quickstart commands">
          <div>
            <span>Terminal</span>
            <CopyCommandButton />
          </div>
          <code><span aria-hidden="true">$</span> ./scripts/run-local.sh</code>
          <code><span aria-hidden="true">$</span> ./scripts/check.sh</code>
        </div>
        <div className="developer-actions">
          <a
            className="button button--accent"
            href={REPOSITORY_URL}
            target="_blank"
            rel="noreferrer"
          >
            Explore the repository <span aria-hidden="true">↗</span>
          </a>
          <a
            className="arrow-link"
            href={`${REPOSITORY_URL}/blob/main/CONTRIBUTING.md`}
            target="_blank"
            rel="noreferrer"
          >
            Contribute <span aria-hidden="true">↗</span>
          </a>
        </div>
      </div>

      <nav className="developer-index" aria-label="Developer documentation">
        {developerLinks.map((link, index) => (
          <a key={link.title} href={link.href} target="_blank" rel="noreferrer">
            <span>{String(index + 1).padStart(2, '0')}</span>
            <strong>{link.title}</strong>
            <small>{link.copy}</small>
            <i aria-hidden="true">↗</i>
          </a>
        ))}
      </nav>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__brand">
        <Brand />
        <p>
          Research-alpha software for inspectable, client-verifiable computation.
          MIT licensed.
        </p>
      </div>

      <nav aria-label="Project links">
        <div>
          <strong>Protocol</strong>
          <a href={`${REPOSITORY_URL}/blob/main/docs/protocol.md`}>Soul Wire v1</a>
          <a href={`${REPOSITORY_URL}/blob/main/docs/security-model.md`}>Security model</a>
          <a href={`${REPOSITORY_URL}/blob/main/ROADMAP.md`}>Roadmap</a>
        </div>
        <div>
          <strong>Build</strong>
          <a href={`${REPOSITORY_URL}/blob/main/README.md#quickstart`}>Quickstart</a>
          <a href={`${REPOSITORY_URL}/tree/main/packages/soul-sdk`}>SDK</a>
          <a href={`${REPOSITORY_URL}/blob/main/docs/deployment.md`}>Run a provider</a>
        </div>
        <div>
          <strong>Project</strong>
          <a href={REPOSITORY_URL}>GitHub</a>
          <a href={`${REPOSITORY_URL}/blob/main/CONTRIBUTING.md`}>Contributing</a>
          <a href={`${REPOSITORY_URL}/blob/main/SECURITY.md`}>Security policy</a>
        </div>
      </nav>

      <div className="site-footer__fineprint">
        <span>Program hash</span>
        <code title={PROGRAM_HASH}>{PROGRAM_HASH}</code>
        <span>Executable SHA-256</span>
        <code title={EXECUTABLE_SHA}>{EXECUTABLE_SHA}</code>
        <a href="#top">Back to top <span aria-hidden="true">↑</span></a>
      </div>
    </footer>
  );
}
