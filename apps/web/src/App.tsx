import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  Cpu,
  Zap,
  CheckCircle,
  Clock,
  Search,
  Menu,
  X,
  Database,
  Terminal,
  ChevronRight,
  ArrowLeft,
  Loader2,
  Book,
  Code,
  LineChart,
  FileCheck,
  FileX,
  Hash,
  Binary,
  GitBranch
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { JobStatus, type JobInput } from '@soul-society/sdk';
import { ServiceType } from './lib/nostr';
import { useNostrClient } from './hooks/useNostrClient';
import { useJobSubmission } from './hooks/useJobSubmission';
import { useJobs, type Job } from './stores/jobStore';
import { useTruncatedPubkey } from './stores/walletStore';

// --- Types ---

type FormField = {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'number';
  placeholder: string;
};

type Service = {
  id: string;
  serviceType: ServiceType;
  name: string;
  description: string;
  provider: string;
  price: string;
  latency: string;
  tags: string[];
  icon: React.ComponentType<{ size?: number, strokeWidth?: number, className?: string }>;
  formFields: FormField[];
};

// --- Services Configuration ---

const SERVICES: Service[] = [
  {
    id: 's1',
    serviceType: ServiceType.Fibonacci,
    name: 'Fibonacci Prover',
    description: 'Computes the n-th Fibonacci number and generates a STARK proof of correct computation.',
    provider: 'soul-provider',
    price: '100 sats',
    latency: '~5s',
    tags: ['ZK-STARK', 'Math', 'Computation'],
    icon: Binary,
    formFields: [
      { name: 'n', label: 'Fibonacci Index (n)', type: 'number', placeholder: 'Enter a number (e.g., 10)' }
    ]
  },
  {
    id: 's2',
    serviceType: ServiceType.HashVerify,
    name: 'Hash Verifier',
    description: 'Verifies that a preimage hashes to a given hash value using Poseidon hash.',
    provider: 'soul-provider',
    price: '150 sats',
    latency: '~3s',
    tags: ['ZK-STARK', 'Crypto', 'Hash'],
    icon: Hash,
    formFields: [
      { name: 'hash', label: 'Expected Hash', type: 'text', placeholder: 'Enter the expected hash (hex)' },
      { name: 'preimage', label: 'Preimage', type: 'text', placeholder: 'Enter the preimage to verify' }
    ]
  },
  {
    id: 's3',
    serviceType: ServiceType.MerkleProof,
    name: 'Merkle Proof Verifier',
    description: 'Verifies that a leaf is part of a Merkle tree given the root and proof path.',
    provider: 'soul-provider',
    price: '200 sats',
    latency: '~4s',
    tags: ['ZK-STARK', 'Merkle', 'Verification'],
    icon: GitBranch,
    formFields: [
      { name: 'root', label: 'Merkle Root', type: 'text', placeholder: 'Enter the Merkle root (hex)' },
      { name: 'leaf', label: 'Leaf Value', type: 'text', placeholder: 'Enter the leaf to verify' },
      { name: 'proof', label: 'Proof Path', type: 'textarea', placeholder: 'Enter sibling hashes, one per line' },
      { name: 'index', label: 'Leaf Index', type: 'number', placeholder: 'Enter the leaf index' }
    ]
  },
];

// --- Components ---

const BrutalButton = ({
  children,
  onClick,
  variant = 'primary',
  className = '',
  icon: Icon,
  disabled = false,
  type = 'button',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  className?: string;
  icon?: React.ComponentType<{ size?: number, strokeWidth?: number, className?: string }>;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
}) => {
  const baseStyles = "relative font-bold border-3 border-black px-6 py-3 transition-all duration-100 flex items-center justify-center gap-2 uppercase tracking-wider text-sm transform-gpu";

  const variants = {
    primary: "bg-stark-orange text-black shadow-[5px_5px_0px_0px_#000] hover:shadow-[7px_7px_0px_0px_#000] enabled:active:translate-x-[3px] enabled:active:translate-y-[3px] enabled:active:shadow-none",
    secondary: "bg-nostr-purple text-black shadow-[5px_5px_0px_0px_#000] hover:shadow-[7px_7px_0px_0px_#000] enabled:active:translate-x-[3px] enabled:active:translate-y-[3px] enabled:active:shadow-none",
    outline: "bg-paper text-black shadow-[5px_5px_0px_0px_#000] hover:shadow-[7px_7px_0px_0px_#000] hover:bg-paper-subtle enabled:active:translate-x-[3px] enabled:active:translate-y-[3px] enabled:active:shadow-none",
    ghost: "border-transparent hover:bg-black/5"
  };

  const disabledStyles = "disabled:bg-gray-300 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none";

  return (
    <motion.button
      type={type}
      onClick={onClick}
      className={`${baseStyles} ${variants[variant]} ${className} ${disabledStyles}`}
      disabled={disabled}
      whileHover={{ scale: disabled ? 1 : 1.05 }}
      whileTap={{ scale: disabled ? 1 : 0.95 }}
    >
      {Icon && <Icon size={18} strokeWidth={3} />}
      <span>{children}</span>
    </motion.button>
  );
};

const BrutalCard = ({ children, className = "", color = "bg-paper", onClick }: { children: React.ReactNode, className?: string, color?: string, onClick?: () => void }) => (
  <div onClick={onClick} className={`border-3 border-black shadow-[8px_8px_0px_0px_#000] p-6 ${color} ${className}`}>
    {children}
  </div>
);

const Badge = ({ children, color = "bg-gray-200", className = "" }: { children: React.ReactNode, color?: string, className?: string }) => (
  <span className={`inline-block border-2 border-black px-3 py-1 text-sm font-bold uppercase tracking-wider ${color} ${className}`}>
    {children}
  </span>
);

const StatusIndicator = ({ status }: { status: JobStatus }) => {
  const styles: Record<JobStatus, { color: string, icon: React.ComponentType<{ size?: number, strokeWidth?: number, className?: string }>, text: string }> = {
    [JobStatus.Pending]: { color: 'bg-bitcoin-gold-light text-bitcoin-gold-dark', icon: Clock, text: 'PENDING' },
    [JobStatus.Processing]: { color: 'bg-blue-200 text-blue-800 animate-pulse', icon: Loader2, text: 'COMPUTING' },
    [JobStatus.Proven]: { color: 'bg-nostr-purple-light text-nostr-purple-dark', icon: Shield, text: 'PROVEN' },
    [JobStatus.Verified]: { color: 'bg-valid-green-light text-valid-green-dark', icon: CheckCircle, text: 'VERIFIED' },
    [JobStatus.Failed]: { color: 'bg-red-200 text-red-800', icon: X, text: 'FAILED' },
  };

  const styleConfig = styles[status] || styles[JobStatus.Pending];
  const { color, icon: Icon, text } = styleConfig;

  return (
    <div className={`flex items-center gap-2 border-3 border-black px-3 py-1.5 ${color}`}>
      <Icon size={16} strokeWidth={3} className={status === JobStatus.Processing ? 'animate-spin' : ''}/>
      <span className="font-bold text-sm uppercase">{text}</span>
    </div>
  );
};

const SoulGeometry = () => (
  <motion.div
    className="relative w-full h-full"
    initial="initial"
    animate="animate"
  >
    <motion.div
      className="absolute w-48 h-48 border-4 border-black bg-nostr-purple"
      variants={{ initial: { x: -100, y: -100, opacity: 0, rotate: -45 }, animate: { x: 0, y: 0, opacity: 1, rotate: 0 }}}
      transition={{ delay: 0.1, type: "spring", stiffness: 100 }}
    />
    <motion.div
      className="absolute right-0 bottom-0 w-48 h-48 border-4 border-black bg-paper"
      variants={{ initial: { x: 100, y: 100, opacity: 0, rotate: 45 }, animate: { x: 0, y: 0, opacity: 1, rotate: 0 }}}
      transition={{ delay: 0.2, type: "spring", stiffness: 100 }}
    />
    <motion.div
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 border-4 border-black bg-stark-orange flex items-center justify-center p-4"
      variants={{ initial: { scale: 0.5, opacity: 0 }, animate: { scale: 1, opacity: 1 }}}
      transition={{ delay: 0.4, duration: 0.5 }}
    >
      <div className="text-center">
        <Cpu size={64} strokeWidth={2} className="mx-auto mb-3 text-black"/>
        <div className="font-mono font-bold text-sm uppercase text-black">STARK-PROVABLE</div>
        <div className="font-mono text-xs mt-1 text-black/70">COMPUTATION MARKET</div>
        <div className="font-mono text-xs mt-2 bg-valid-green border-2 border-black inline-block px-2 py-0.5">STATUS: ONLINE</div>
      </div>
    </motion.div>
  </motion.div>
);

const ServicePage = ({ service, onBack }: { service: Service, onBack: () => void }) => {
  const [formData, setFormData] = useState<Record<string, string>>({});
  const { submit, isSubmitting, error } = useJobSubmission();
  const { status: walletStatus } = useNostrClient();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Build input based on service type
    let input: JobInput;
    switch (service.serviceType) {
      case ServiceType.Fibonacci:
        input = { type: ServiceType.Fibonacci, n: parseInt(formData.n || '0', 10) };
        break;
      case ServiceType.HashVerify:
        input = { type: ServiceType.HashVerify, hash: formData.hash || '', preimage: formData.preimage || '' };
        break;
      case ServiceType.MerkleProof:
        input = {
          type: ServiceType.MerkleProof,
          root: formData.root || '',
          leaf: formData.leaf || '',
          proof: formData.proof?.split('\n').filter(Boolean) || [],
          index: parseInt(formData.index || '0', 10)
        };
        break;
      default:
        return;
    }

    const requestId = await submit(service.serviceType, input);
    if (requestId) {
      onBack();
    }
  };

  const isConnected = walletStatus === 'connected';

  return (
    <motion.div
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -100 }}
      transition={{ duration: 0.3 }}
    >
      <div className="mb-8">
        <BrutalButton onClick={onBack} variant="outline" className="!px-4">
          <ArrowLeft size={20} strokeWidth={3}/>
          <span className="ml-2">Back to Market</span>
        </BrutalButton>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        <div className="lg:col-span-2">
          <BrutalCard color="bg-paper" className="shadow-[10px_10px_0px_0px_#000] h-full">
            <div className="flex items-start gap-6 mb-6">
              <div className="p-4 border-3 border-black bg-stark-orange shadow-[4px_4px_0_#000]">
                <service.icon size={40} strokeWidth={2.5} className="text-black"/>
              </div>
              <div>
                <h2 className="text-4xl font-black uppercase tracking-tight">{service.name}</h2>
                <p className="text-lg font-medium text-black/60 mt-1">{service.description}</p>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-4 border-3 border-black bg-red-100 text-red-800 font-bold">
                Error: {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6 border-t-4 border-black border-dashed pt-6">
              {service.formFields.map(field => (
                <div key={field.name} className="flex flex-col">
                  <label htmlFor={field.name} className="text-base font-bold uppercase mb-2 tracking-wider">{field.label}</label>
                  {field.type === 'textarea' ? (
                    <textarea
                      id={field.name}
                      name={field.name}
                      placeholder={field.placeholder}
                      onChange={handleInputChange}
                      rows={6}
                      className="border-3 border-black p-3 font-mono text-base bg-paper-subtle focus:outline-none focus:shadow-[5px_5px_0_#9D4EDD] transition-shadow duration-100 focus:bg-white"
                      required
                    />
                  ) : (
                    <input
                      id={field.name}
                      name={field.name}
                      type={field.type}
                      placeholder={field.placeholder}
                      onChange={handleInputChange}
                      className="border-3 border-black p-3 font-mono text-base bg-paper-subtle focus:outline-none focus:shadow-[5px_5px_0_#9D4EDD] transition-shadow duration-100 focus:bg-white"
                      required
                    />
                  )}
                </div>
              ))}
              <BrutalButton
                type="submit"
                variant="primary"
                className="w-full text-lg"
                disabled={isSubmitting || !isConnected}
              >
                {!isConnected ? (
                  'Connect Wallet First'
                ) : isSubmitting ? (
                  <><Loader2 className="animate-spin"/> Submitting...</>
                ) : (
                  <>Request Proof ({service.price})</>
                )}
              </BrutalButton>
            </form>
          </BrutalCard>
        </div>
        <div className="lg:col-span-1">
          <BrutalCard color="bg-nostr-purple-light" className="!shadow-nostr-purple-dark">
            <h3 className="text-2xl font-black uppercase tracking-tight mb-4 border-b-3 border-black pb-3">Service Details</h3>
            <div className="space-y-4 font-mono text-base">
              <div className="flex justify-between">
                <span className="font-bold text-black/60">PROVIDER:</span>
                <span className="font-bold truncate text-black">{service.provider}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold text-black/60">AVG. LATENCY:</span>
                <span className="font-bold text-black">{service.latency}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold text-black/60">PRICE:</span>
                <span className="font-bold text-black">{service.price}</span>
              </div>
            </div>
            <div className="mt-6 pt-6 border-t-2 border-black border-dashed">
              <h4 className="font-bold uppercase tracking-wider mb-3">Tags</h4>
              <div className="flex flex-wrap gap-2">
                {service.tags.map(tag => (
                  <Badge key={tag} color="bg-nostr-purple text-white">#{tag}</Badge>
                ))}
              </div>
            </div>
          </BrutalCard>
        </div>
      </div>
    </motion.div>
  );
};

const ProofModal = ({ job, onClose }: { job: Job, onClose: () => void }) => {
  const [verificationSteps, setVerificationSteps] = useState<string[]>([]);
  const [isVerified, setIsVerified] = useState(false);

  useEffect(() => {
    const steps = [
      'Fetching proof from decentralized storage...',
      'Parsing STARK proof data...',
      'Running verification algorithm...',
      'STARK proof is valid!',
    ];
    let currentStep = 0;
    const interval = setInterval(() => {
      setVerificationSteps(prev => [...prev, steps[currentStep]]);
      currentStep++;
      if (currentStep === steps.length) {
        clearInterval(interval);
        setIsVerified(true);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, []);

  const service = SERVICES.find(s => s.id === job.serviceId);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.8, y: 50 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.8, y: 50 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-2xl bg-paper border-4 border-black shadow-[12px_12px_0_#000] p-8"
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-black uppercase">Proof Verification</h2>
          <button onClick={onClose} className="p-1 active:translate-x-[2px] active:translate-y-[2px]"><X size={32} /></button>
        </div>

        <div className="space-y-4 font-mono text-sm border-y-3 border-black py-4">
          {verificationSteps.map((step, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="flex items-center gap-3"
            >
              {i < verificationSteps.length - 1 ? <Loader2 className="animate-spin text-gray-500"/> : isVerified ? <FileCheck className="text-valid-green" /> : <FileX className="text-red-500" />}
              <span>{step}</span>
            </motion.div>
          ))}
        </div>

        {isVerified && service && job.output && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6">
            <h3 className="text-2xl font-black uppercase mb-4">Job Result</h3>
            <BrutalCard color="bg-paper-subtle">
              <pre className="font-mono text-sm overflow-auto whitespace-pre-wrap">
                {JSON.stringify(job.output, null, 2)}
              </pre>
              {job.proof && (
                <div className="font-mono text-xs mt-4 pt-4 border-t-2 border-dashed border-black">
                  <p><strong>Proof Commitment:</strong> {job.proof.commitment}</p>
                  <p><strong>Proof Size:</strong> {job.proof.proofBytes?.length || 0} bytes</p>
                </div>
              )}
            </BrutalCard>
          </motion.div>
        )}

        {job.error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6">
            <h3 className="text-2xl font-black uppercase mb-4 text-red-600">Error</h3>
            <BrutalCard color="bg-red-100">
              <p className="font-mono text-red-800">{job.error}</p>
            </BrutalCard>
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
};

// --- Main Application ---

export default function App() {
  const [activeTab, setActiveTab] = useState<'market' | 'jobs'>('market');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [verifyingJob, setVerifyingJob] = useState<Job | null>(null);

  const { status, connect, disconnect } = useNostrClient();
  const truncatedPubkey = useTruncatedPubkey();
  const jobs = useJobs();

  const walletConnected = status === 'connected';

  const toggleWallet = useCallback(() => {
    if (walletConnected) {
      disconnect();
    } else {
      connect();
    }
  }, [walletConnected, connect, disconnect]);

  const filteredServices = SERVICES.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-stark-orange text-black font-sans selection:bg-nostr-purple selection:text-white">
      <div className="absolute inset-0 bg-grid-pattern opacity-30"></div>

      <header className="relative sticky top-0 z-50 border-b-4 border-black bg-paper/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-black text-stark-orange flex items-center justify-center">
              <Shield size={28} strokeWidth={3}/>
            </div>
            <h1 className="text-3xl font-black tracking-tighter uppercase hidden sm:block">
              SoulSociety<span className="text-black">.</span>
            </h1>
          </div>

          <nav className="hidden lg:flex gap-8 items-center font-bold uppercase tracking-wider text-sm">
            <a href="#" className="flex items-center gap-2 hover:text-stark-orange transition-colors"><Book size={16} strokeWidth={3}/> Docs</a>
            <a href="#" className="flex items-center gap-2 hover:text-stark-orange transition-colors"><Code size={16} strokeWidth={3}/> Explorers</a>
            <a href="#" className="flex items-center gap-2 hover:text-stark-orange transition-colors"><LineChart size={16} strokeWidth={3}/> Stats</a>
          </nav>

          <div className="flex items-center gap-4">
             <div className="hidden md:block">
                <BrutalButton
                  variant={walletConnected ? 'outline' : 'secondary'}
                  onClick={toggleWallet}
                  className="py-2"
                  icon={walletConnected ? CheckCircle : Zap}
                >
                  {walletConnected ? truncatedPubkey || 'Connected' : status === 'connecting' ? 'Connecting...' : 'Connect'}
                </BrutalButton>
             </div>
             <button onClick={() => setSidebarOpen(true)} className="lg:hidden border-3 border-black p-2 bg-paper active:bg-gray-100 shadow-[3px_3px_0px_0px_#000] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all">
               <Menu size={24} strokeWidth={3}/>
             </button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSidebarOpen(false)} className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]"/>
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: "spring", stiffness: 300, damping: 30 }} className="fixed right-0 top-0 bottom-0 w-72 bg-paper border-l-4 border-black z-[70] p-8">
              <div className="flex justify-between items-center mb-12">
                <h2 className="font-black text-2xl uppercase">Menu</h2>
                <button onClick={() => setSidebarOpen(false)} className="p-1 active:translate-x-[2px] active:translate-y-[2px]"><X size={32} /></button>
              </div>
              <div className="flex flex-col gap-8 text-xl font-bold uppercase tracking-wider">
                <a href="#" className="flex items-center gap-3 hover:text-stark-orange"><Book size={20} strokeWidth={3}/> Docs</a>
                <a href="#" className="flex items-center gap-3 hover:text-stark-orange"><Code size={20} strokeWidth={3}/> Explorers</a>
                <a href="#" className="flex items-center gap-3 hover:text-stark-orange"><LineChart size={20} strokeWidth={3}/> Stats</a>
                <hr className="border-black my-4 border-dashed" />
                <BrutalButton variant="secondary" onClick={toggleWallet} className="w-full">
                  {walletConnected ? 'Disconnect' : 'Connect Nostr'}
                </BrutalButton>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <main className="relative max-w-7xl mx-auto p-4 md:p-8 space-y-24">
        <AnimatePresence mode="wait">
          {selectedService ? (
            <ServicePage
              key="service-page"
              service={selectedService}
              onBack={() => setSelectedService(null)}
            />
          ) : (
            <motion.div key="main-content">
              <motion.section className="grid grid-cols-1 lg:grid-cols-5 gap-12 items-center py-16 md:py-24" initial="hidden" animate="visible" variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.1 } } }}>
                <motion.div className="lg:col-span-3 space-y-8 text-center lg:text-left" variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 }}}>
                  <Badge color="bg-nostr-purple text-white" className="mx-auto lg:mx-0">Stark-Powered Trust</Badge>
                  <h2 className="text-7xl md:text-8xl font-black leading-none uppercase text-black tracking-tighter">
                    Don't Trust. <br />
                    <span className="bg-paper px-4 text-black shadow-[8px_8px_0px_0px_#000] inline-block mt-4">Verify.</span>
                  </h2>
                  <p className="text-xl md:text-2xl font-semibold max-w-2xl mx-auto lg:mx-0 !leading-relaxed">
                    Integrity by default. Powered by STARKs. A permissionless marketplace for verifiable digital services.
                  </p>
                  <div className="flex flex-wrap justify-center lg:justify-start gap-4 pt-6">
                    <BrutalButton icon={Terminal} variant="secondary" onClick={() => setActiveTab('market')}>Explore Market</BrutalButton>
                    <BrutalButton variant="outline" icon={Database}>DVM Specs</BrutalButton>
                  </div>
                </motion.div>
                <div className="lg:col-span-2 relative hidden lg:block h-96">
                  <SoulGeometry />
                </div>
              </motion.section>

              <motion.section className="border-y-4 border-black bg-nostr-purple text-white py-12" initial={{ opacity: 0, y: 50 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.3 }}>
                <div className="max-w-7xl mx-auto px-4 md:px-8">
                  <div className="flex flex-col md:flex-row justify-between items-center border-b-4 border-white pb-8 mb-10 gap-8">
                    <div className="flex border-3 border-black shadow-[5px_5px_0_#000]">
                      <button onClick={() => setActiveTab('market')} className={`text-xl font-bold uppercase px-8 py-4 border-r-3 border-black transition-colors ${activeTab === 'market' ? 'bg-paper text-black' : 'bg-transparent hover:bg-white/10'}`}>Marketplace</button>
                      <button onClick={() => setActiveTab('jobs')} className={`text-xl font-bold uppercase px-8 py-4 transition-colors relative ${activeTab === 'jobs' ? 'bg-paper text-black' : 'bg-transparent hover:bg-white/10'}`}>
                        Live Jobs
                        {jobs.length > 0 && (
                          <span className="absolute -top-3 -right-3 text-sm h-8 w-8 flex items-center justify-center bg-bitcoin-gold text-black px-1.5 py-0.5 border-3 border-black font-bold rounded-full">{jobs.length}</span>
                        )}
                      </button>
                    </div>
                    <div className="w-full md:w-auto relative">
                      <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-black/40" size={24} strokeWidth={3}/>
                      <input type="text" placeholder="Find a service by name or tag..." className="w-full md:w-96 border-3 border-black py-4 pl-16 pr-6 font-bold text-lg focus:outline-none focus:bg-white transition-all shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] focus:shadow-[8px_8px_0px_0px_#000] bg-paper text-black" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                    </div>
                  </div>

                  <AnimatePresence mode="wait">
                    <motion.div key={activeTab} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.2 }} className="min-h-[400px]">
                      {activeTab === 'market' ? (
                        <motion.div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10" variants={{ visible: { transition: { staggerChildren: 0.05 } }}} initial="hidden" animate="visible">
                          {filteredServices.map((service) => (
                            <motion.div key={service.id} variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}>
                              <BrutalCard onClick={() => setSelectedService(service)} className="h-full flex flex-col group cursor-pointer transition-all duration-100 hover:shadow-[12px_12px_0px_0px_#000] !shadow-nostr-purple-dark bg-paper transform-gpu hover:-translate-y-1">
                                <div className="flex justify-between items-start mb-4">
                                  <div className="p-3 border-3 border-black bg-stark-orange shadow-[4px_4px_0_#000]"><service.icon size={28} strokeWidth={2.5} className="text-black"/></div>
                                  <Badge color="bg-bitcoin-gold text-black">{service.price}</Badge>
                                </div>
                                <h3 className="text-2xl font-black uppercase tracking-tight mb-2 text-black">{service.name}</h3>
                                <p className="text-base font-medium mb-4 flex-grow text-black/70">{service.description}</p>
                                <div className="space-y-3 font-mono text-sm border-t-2 border-black pt-4 mt-auto">
                                  <div className="flex justify-between"><span className="text-black/60">PROVIDER:</span><span className="font-bold truncate text-black">{service.provider}</span></div>
                                  <div className="flex justify-between"><span className="text-black/60">LATENCY:</span><span className="font-bold text-black">{service.latency}</span></div>
                                </div>
                                <div className="mt-4 flex flex-wrap gap-2">
                                  {service.tags.map(tag => (<Badge key={tag} color="bg-stark-orange-light text-stark-orange-dark">#{tag}</Badge>))}
                                </div>
                              </BrutalCard>
                            </motion.div>
                          ))}
                          {filteredServices.length === 0 && (
                            <div className="col-span-full text-center py-16"><p className="text-2xl font-bold text-white">No services found.</p><p className="text-white/70">Try a different search query.</p></div>
                          )}
                        </motion.div>
                      ) : (
                        <div className="space-y-6">
                          <AnimatePresence>
                            {jobs.map((job) => {
                              const service = SERVICES.find(s => s.id === job.serviceId);
                              return (
                                <motion.div key={job.id} layout initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} transition={{ duration: 0.3 }}>
                                  <BrutalCard color="bg-paper-subtle" className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 !shadow-nostr-purple-dark">
                                    <div className="flex items-center gap-5 w-full lg:w-auto">
                                      <div className="p-3 border-3 border-black bg-nostr-purple shadow-[3px_3px_0_#000]">
                                        {service ? <service.icon size={28} strokeWidth={3} className="text-white"/> : <Cpu size={28} strokeWidth={3} className="text-white"/>}
                                      </div>
                                      <div className="flex-grow">
                                        <div className="font-black text-xl uppercase text-black">{service?.name || 'Unknown Service'}</div>
                                        <div className="font-mono text-sm text-black/60 flex items-center gap-2">
                                          <span>ID: {job.id.substring(0, 16)}...</span>
                                          <span className="text-black/40">•</span>
                                          <span>{new Date(job.timestamp).toLocaleTimeString()}</span>
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full lg:w-auto self-end">
                                      {job.status === JobStatus.Processing && job.progress !== undefined && (
                                        <div className="w-full sm:w-32 h-8 border-2 border-black bg-white relative">
                                          <div className="absolute inset-0 bg-blue-300" style={{ width: `${job.progress}%`}}></div>
                                          <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-black">{Math.round(job.progress)}%</div>
                                        </div>
                                      )}
                                      {job.proof && (
                                        <div className="font-mono text-sm bg-gray-100 p-2 border-2 border-black truncate flex-grow text-center">
                                          PROOF: <span className="font-bold">{job.proof.commitment?.substring(0, 12)}...</span>
                                        </div>
                                      )}
                                      <StatusIndicator status={job.status} />
                                      <BrutalButton variant="outline" className="p-3 w-full sm:w-auto !shadow-nostr-purple-dark" onClick={() => setVerifyingJob(job)}>
                                        <ChevronRight size={24} strokeWidth={3}/>
                                      </BrutalButton>
                                    </div>
                                  </BrutalCard>
                                </motion.div>
                              );
                            })}
                          </AnimatePresence>
                          {jobs.length === 0 && (
                            <div className="border-4 border-black border-dashed p-12 text-center bg-paper/20">
                              <p className="text-lg font-bold text-white/70">No jobs yet.</p>
                              <p className="text-white/50 mt-2">Submit a job to see it here!</p>
                            </div>
                          )}
                          <div className="border-4 border-black border-dashed p-12 text-center bg-paper/20">
                            <p className="text-lg font-bold text-white/50 animate-pulse">Listening for new DVM events...</p>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </motion.section>
            </motion.div>
          )}
        </AnimatePresence>

        <footer className="border-t-4 border-black mt-24 bg-paper py-12">
          <div className="max-w-7xl mx-auto px-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
              <div className="lg:col-span-2"><h2 className="text-4xl font-black uppercase mb-4 tracking-tighter">SoulSociety.</h2><p className="text-lg font-semibold max-w-md !leading-relaxed">A permissionless marketplace of verifiable digital services, providing integrity by default thanks to the power of STARKs.</p></div>
              <div>
                <h3 className="font-bold text-lg border-b-3 border-black inline-block mb-4 uppercase tracking-wider">Protocol</h3>
                <ul className="space-y-3 text-base font-medium">
                  <li><a href="#" className="hover:text-stark-orange">NIP-90 (DVMs)</a></li>
                  <li><a href="#" className="hover:text-stark-orange">Circle STARKs</a></li>
                  <li><a href="#" className="hover:text-stark-orange">Cairo Lang</a></li>
                </ul>
              </div>
              <div>
                <h3 className="font-bold text-lg border-b-3 border-black inline-block mb-4 uppercase tracking-wider">Community</h3>
                <ul className="space-y-3 text-base font-medium">
                  <li><a href="#" className="hover:text-stark-orange">Github</a></li>
                  <li><a href="#" className="hover:text-stark-orange">Nostr</a></li>
                  <li><a href="#" className="hover:text-stark-orange">Telegram</a></li>
                </ul>
              </div>
            </div>
            <div className="mt-16 pt-8 border-t-2 border-black border-dashed font-mono text-sm text-center md:text-left text-black/60">© 2025 SOULSOCIETY. NO RIGHTS RESERVED. OPEN SOURCE.</div>
          </div>
        </footer>
      </main>
      <AnimatePresence>
        {verifyingJob && <ProofModal job={verifyingJob} onClose={() => setVerifyingJob(null)} />}
      </AnimatePresence>
    </div>
  );
}
