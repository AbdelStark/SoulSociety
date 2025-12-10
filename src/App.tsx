import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Cpu, 
  Zap, 
  CheckCircle, 
  Clock, 
  Search, 
  Menu, 
  X, 
  ArrowRight,
  Database,
  Lock,
  Terminal,
  Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// --- Types & Mock Data ---

type Service = {
  id: string;
  name: string;
  description: string;
  provider: string;
  price: string; // sats
  latency: string;
  tags: string[];
};

type Job = {
  id: string;
  serviceId: string;
  status: 'pending' | 'processing' | 'proven' | 'verified';
  timestamp: string;
  proofHash?: string;
};

const MOCK_SERVICES: Service[] = [
  {
    id: 's1',
    name: 'STWO Cairo Verifier',
    description: 'Generates STARK proofs for Cairo assembly traces using the STWO prover.',
    provider: 'npub...zk42',
    price: '250 sats',
    latency: '~12s',
    tags: ['ZK-STARK', 'Cairo', 'Computation']
  },
  {
    id: 's2',
    name: 'Bitcoin Block Header PoW',
    description: 'Verifies Bitcoin block header work for light clients.',
    provider: 'npub...btc1',
    price: '50 sats',
    latency: '~2s',
    tags: ['Bitcoin', 'PoW']
  },
  {
    id: 's3',
    name: 'Image Resizer (Trustless)',
    description: 'Resizes images and provides a hash-commitment of the operation.',
    provider: 'npub...img9',
    price: '100 sats',
    latency: '~5s',
    tags: ['Media', 'Utility']
  },
  {
    id: 's4',
    name: 'Schnorr Signature Aggregator',
    description: 'Aggregates multiple Schnorr signatures into a single validity proof.',
    provider: 'npub...sig7',
    price: '500 sats',
    latency: '~45s',
    tags: ['Crypto', 'Signatures']
  }
];

const MOCK_JOBS: Job[] = [
  { id: 'job_8f7a...9c21', serviceId: 's1', status: 'verified', timestamp: '2 mins ago', proofHash: '0x7a...9f' },
  { id: 'job_3b2c...1d44', serviceId: 's3', status: 'proven', timestamp: '5 mins ago', proofHash: '0x3b...1d' },
  { id: 'job_9e11...00p2', serviceId: 's1', status: 'processing', timestamp: 'Just now' },
];

// --- Components ---

const BrutalButton = ({ 
  children, 
  onClick, 
  variant = 'primary', 
  className = '',
  icon: Icon
}: { 
  children: React.ReactNode; 
  onClick?: () => void; 
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  className?: string;
  icon?: any;
}) => {
  const baseStyles = "relative font-bold border-2 border-black px-6 py-3 transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none flex items-center justify-center gap-2";
  
  const variants = {
    primary: "bg-stark-orange text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-stark-orange-hover",
    secondary: "bg-nostr-purple text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-nostr-purple-hover",
    outline: "bg-white text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-gray-50",
    ghost: "border-transparent hover:bg-black/5"
  };

  return (
    <button onClick={onClick} className={`${baseStyles} ${variants[variant]} ${className}`}>
      {Icon && <Icon size={20} strokeWidth={2.5} />}
      {children}
    </button>
  );
};

const BrutalCard = ({ children, className = "", color = "bg-white" }: { children: React.ReactNode, className?: string, color?: string }) => (
  <div className={`border-2 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] p-6 ${color} ${className}`}>
    {children}
  </div>
);

const Badge = ({ children, color = "bg-gray-200" }: { children: React.ReactNode, color?: string }) => (
  <span className={`inline-block border-2 border-black px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${color}`}>
    {children}
  </span>
);

const StatusIndicator = ({ status }: { status: Job['status'] }) => {
  const styles = {
    pending: { color: 'bg-yellow-300', icon: Clock, text: 'PENDING' },
    processing: { color: 'bg-blue-300', icon: Activity, text: 'COMPUTING' },
    proven: { color: 'bg-purple-300', icon: Shield, text: 'PROVEN' },
    verified: { color: 'bg-valid-green', icon: CheckCircle, text: 'VERIFIED' },
  };

  const { color, icon: Icon, text } = styles[status];

  return (
    <div className={`flex items-center gap-2 border-2 border-black px-3 py-1 ${color}`}>
      <Icon size={16} strokeWidth={3} />
      <span className="font-bold text-sm">{text}</span>
    </div>
  );
};

// --- Main Application ---

export default function App() {
  const [activeTab, setActiveTab] = useState<'market' | 'jobs'>('market');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  // Mock connecting wallet
  const [walletConnected, setWalletConnected] = useState(false);
  const toggleWallet = () => setWalletConnected(!walletConnected);

  return (
    <div className="min-h-screen bg-paper text-black font-sans selection:bg-stark-orange selection:text-white">
      
      {/* --- Navigation --- */}
      <nav className="sticky top-0 z-50 border-b-2 border-black bg-white px-4 py-3 shadow-[0px_4px_0px_0px_rgba(0,0,0,0.1)]">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-black text-white flex items-center justify-center border-2 border-transparent">
              <Shield size={24} />
            </div>
            <h1 className="text-2xl font-black tracking-tighter uppercase hidden sm:block">
              SoulSociety<span className="text-stark-orange">.</span>
            </h1>
          </div>

          <div className="hidden md:flex gap-6 items-center font-bold">
            <a href="#" className="hover:underline decoration-2 underline-offset-4">Docs</a>
            <a href="#" className="hover:underline decoration-2 underline-offset-4">Explorers</a>
            <a href="#" className="hover:underline decoration-2 underline-offset-4">DVM Stats</a>
          </div>

          <div className="flex items-center gap-4">
             <div className="hidden md:block">
                <BrutalButton 
                  variant={walletConnected ? 'outline' : 'primary'} 
                  onClick={toggleWallet}
                  className="py-2 px-4 text-sm"
                  icon={walletConnected ? CheckCircle : Zap}
                >
                  {walletConnected ? 'npub1...8z9' : 'Connect Nostr'}
                </BrutalButton>
             </div>
             <button onClick={() => setSidebarOpen(true)} className="md:hidden border-2 border-black p-2 active:bg-gray-100">
               <Menu size={24} />
             </button>
          </div>
        </div>
      </nav>

      {/* --- Mobile Sidebar --- */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 bg-black z-[60]"
            />
            <motion.div 
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: "spring", damping: 20 }}
              className="fixed right-0 top-0 bottom-0 w-64 bg-white border-l-2 border-black z-[70] p-6 shadow-[-10px_0_0_rgba(0,0,0,0.1)]"
            >
              <div className="flex justify-between items-center mb-8">
                <h2 className="font-black text-xl">MENU</h2>
                <button onClick={() => setSidebarOpen(false)}><X size={28} /></button>
              </div>
              <div className="flex flex-col gap-4">
                <a href="#" className="text-lg font-bold hover:text-stark-orange">Documentation</a>
                <a href="#" className="text-lg font-bold hover:text-stark-orange">Network Stats</a>
                <hr className="border-black border-dashed" />
                <BrutalButton variant="primary" onClick={toggleWallet} className="w-full">
                  {walletConnected ? 'Disconnect' : 'Connect Nostr'}
                </BrutalButton>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* --- Main Content --- */}
      <main className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8 space-y-12">

        {/* --- Hero Section --- */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center py-8">
          <div className="space-y-6">
            <Badge color="bg-nostr-purple text-white">Nostr + ZK-STARKs</Badge>
            <h2 className="text-5xl md:text-7xl font-black leading-[0.9] uppercase">
              Don't Trust.<br />
              <span className="bg-stark-orange px-2 text-white shadow-[4px_4px_0px_0px_#000]">Verify.</span>
            </h2>
            <p className="text-xl font-medium border-l-4 border-black pl-4 py-1">
              Integrity by default. Powered by STARKs.
            </p>
            <div className="flex flex-wrap gap-4 pt-4">
              <BrutalButton icon={Terminal}>
                Start Proving
              </BrutalButton>
              <BrutalButton variant="outline" icon={Database}>
                View DVM Specs
              </BrutalButton>
            </div>
          </div>

          <div className="relative hidden lg:block h-64 lg:h-auto">
             {/* Abstract Geometric Decoration */}
             <div className="absolute right-0 top-0 w-64 h-64 border-4 border-black bg-nostr-purple"></div>
             <div className="absolute right-8 top-8 w-64 h-64 border-4 border-black bg-stark-orange"></div>
             <div className="absolute right-16 top-16 w-64 h-64 border-4 border-black bg-white flex items-center justify-center">
                <div className="text-center">
                  <Cpu size={64} strokeWidth={1.5} className="mx-auto mb-2"/>
                  <div className="font-mono font-bold text-xs">STWO PROVER</div>
                  <div className="font-mono text-[10px] mt-1">STATUS: ONLINE</div>
                </div>
             </div>
          </div>
        </section>

        {/* --- Dashboard Controls --- */}
        <section>
          <div className="flex flex-col md:flex-row justify-between items-end border-b-4 border-black pb-4 mb-8 gap-4">
             <div className="flex gap-2">
                <button 
                  onClick={() => setActiveTab('market')}
                  className={`text-xl font-black px-4 py-2 border-t-2 border-x-2 border-black ${activeTab === 'market' ? 'bg-stark-orange text-white -mb-[18px] relative z-10 pb-4' : 'bg-gray-100 hover:bg-gray-200'}`}
                >
                  MARKETPLACE
                </button>
                <button 
                  onClick={() => setActiveTab('jobs')}
                  className={`text-xl font-black px-4 py-2 border-t-2 border-x-2 border-black ${activeTab === 'jobs' ? 'bg-stark-orange text-white -mb-[18px] relative z-10 pb-4' : 'bg-gray-100 hover:bg-gray-200'}`}
                >
                  LIVE JOBS <span className="text-xs ml-1 bg-black text-white px-1.5 py-0.5 rounded-full">3</span>
                </button>
             </div>
             
             <div className="w-full md:w-auto relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2" size={20} />
                <input 
                  type="text" 
                  placeholder="Find a DVM..." 
                  className="w-full md:w-80 border-2 border-black py-2 pl-10 pr-4 font-bold focus:outline-none focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-shadow"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
             </div>
          </div>

          {/* --- Tab Content --- */}
          <div className="min-h-[400px]">
            {activeTab === 'market' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {MOCK_SERVICES.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase())).map((service) => (
                  <BrutalCard key={service.id} className="group hover:-translate-y-1 hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all cursor-pointer">
                    <div className="flex justify-between items-start mb-4">
                      <div className="p-2 border-2 border-black bg-zk-blue-light">
                        <Cpu size={24} />
                      </div>
                      <Badge color="bg-stark-orange text-white">{service.price}</Badge>
                    </div>
                    
                    <h3 className="text-xl font-black uppercase mb-2 group-hover:underline decoration-4 underline-offset-4">{service.name}</h3>
                    <p className="text-sm font-medium mb-4 line-clamp-2">{service.description}</p>
                    
                    <div className="space-y-3 font-mono text-xs border-t-2 border-black pt-3 border-dashed">
                       <div className="flex justify-between">
                         <span className="text-gray-500">PROVIDER</span>
                         <span className="font-bold">{service.provider}</span>
                       </div>
                       <div className="flex justify-between">
                         <span className="text-gray-500">AVG LATENCY</span>
                         <span className="font-bold">{service.latency}</span>
                       </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {service.tags.map(tag => (
                        <span key={tag} className="text-[10px] font-bold border border-black px-1 bg-white">#{tag}</span>
                      ))}
                    </div>

                    <button className="w-full mt-4 bg-black text-white font-bold py-2 hover:bg-stark-orange hover:text-black border-2 border-transparent hover:border-black transition-colors">
                      REQUEST PROOF
                    </button>
                  </BrutalCard>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {MOCK_JOBS.map((job) => (
                  <div key={job.id} className="border-2 border-black bg-white p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-4 w-full md:w-auto">
                      <div className="p-3 border-2 border-black bg-gray-50 font-mono text-xl font-bold">
                         #ZK
                      </div>
                      <div>
                        <div className="font-black text-lg uppercase flex items-center gap-2">
                          {MOCK_SERVICES.find(s => s.id === job.serviceId)?.name}
                        </div>
                        <div className="font-mono text-xs text-gray-500">ID: {job.id} • {job.timestamp}</div>
                      </div>
                    </div>

                    <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
                       {job.proofHash && (
                         <div className="hidden lg:block font-mono text-[10px] bg-gray-100 p-1 border border-black truncate max-w-[150px]">
                           Hash: {job.proofHash}
                         </div>
                       )}
                       <StatusIndicator status={job.status} />
                       <button className="p-2 border-2 border-black hover:bg-black hover:text-white transition-colors">
                         <ArrowRight size={20} />
                       </button>
                    </div>
                  </div>
                ))}

                {/* Empty state simulation */}
                <div className="border-2 border-black border-dashed p-8 text-center bg-gray-50 opacity-50">
                  <p className="font-bold text-gray-400">Listening for new DVM events (Kind 6600)...</p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* --- Footer --- */}
        <footer className="border-t-4 border-black py-12 mt-12 bg-white">
           <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
              <div className="md:col-span-2">
                 <h2 className="text-3xl font-black uppercase mb-4">SoulSociety.</h2>
                 <p className="font-medium max-w-sm">
                  Integrity by default. Powered by STARKs.
                 </p>
              </div>
              <div>
                 <h3 className="font-bold border-b-2 border-black inline-block mb-4">PROTOCOL</h3>
                 <ul className="space-y-2 text-sm font-medium">
                    <li><a href="#" className="hover:text-stark-orange">NIP-90 (DVMs)</a></li>
                    <li><a href="#" className="hover:text-stark-orange">Circle STARKs</a></li>
                    <li><a href="#" className="hover:text-stark-orange">Cairo Lang</a></li>
                 </ul>
              </div>
              <div>
                 <h3 className="font-bold border-b-2 border-black inline-block mb-4">COMMUNITY</h3>
                 <ul className="space-y-2 text-sm font-medium">
                    <li><a href="#" className="hover:text-stark-orange">Github</a></li>
                    <li><a href="#" className="hover:text-stark-orange">Nostr</a></li>
                    <li><a href="#" className="hover:text-stark-orange">Telegram</a></li>
                 </ul>
              </div>
           </div>
           <div className="mt-12 font-mono text-xs text-center md:text-left">
              © 2025 SOULSOCIETY. NO RIGHTS RESERVED. OPEN SOURCE.
           </div>
        </footer>
      </main>
    </div>
  );
}
