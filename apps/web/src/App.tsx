import { useEffect, useState } from 'react';

import { ReceiptLedger } from './features/receipts/ReceiptLedger';
import { useSoulTerminal } from './features/terminal/useSoulTerminal';
import { RequestWorkbench } from './features/workbench/RequestWorkbench';
import {
  DeveloperSection,
  EvidenceSection,
  Hero,
  ProtocolOverview,
  ServicesSection,
  SiteFooter,
  SiteHeader,
  TrustBoundary,
} from './features/landing/LandingSections';

export default function App() {
  const [verifierEnabled, setVerifierEnabled] = useState(false);
  const terminal = useSoulTerminal(verifierEnabled);

  useEffect(() => {
    const workbench = document.getElementById('workbench');
    if (!workbench || typeof IntersectionObserver === 'undefined') {
      const fallbackTimer = window.setTimeout(() => setVerifierEnabled(true), 0);
      return () => window.clearTimeout(fallbackTimer);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVerifierEnabled(true);
          observer.disconnect();
        }
      },
      { rootMargin: '700px 0px' },
    );
    observer.observe(workbench);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <SiteHeader verifierStatus={terminal.verifierState.status} />

      <main id="main-content">
        <div id="top" />
        <Hero />
        <ProtocolOverview />
        <EvidenceSection />
        <ServicesSection />
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
        <TrustBoundary />
        <DeveloperSection />
      </main>

      <SiteFooter />
    </>
  );
}
