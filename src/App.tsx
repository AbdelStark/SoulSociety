import React, { useState } from 'react';
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
  Terminal,
  Activity,
  ChevronRight,
  GitCommit,
  Layers
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
  icon: React.ComponentType<{ size?: number, strokeWidth?: number, className?: string }>;
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
    tags: ['ZK-STARK', 'Cairo', 'Computation'],
    icon: Cpu
  },
  {
    id: 's2',
    name: 'Bitcoin Block Header PoW',
    description: 'Verifies Bitcoin block header work for light clients.',
    provider: 'npub...btc1',
    price: '50 sats',
    latency: '~2s',
    tags: ['Bitcoin', 'PoW'],
    icon: GitCommit
  },
  {
    id: 's3',
    name: 'Image Resizer (Trustless)',
    description: 'Resizes images and provides a hash-commitment of the operation.',
    provider: 'npub...img9',
    price: '100 sats',
    latency: '~5s',
    tags: ['Media', 'Utility'],
    icon: Layers
  },
  {
    id: 's4',
    name: 'Schnorr Signature Aggregator',
    description: 'Aggregates multiple Schnorr signatures into a single validity proof.',
    provider: 'npub...sig7',
    price: '500 sats',
    latency: '~45s',
    tags: ['Crypto', 'Signatures'],
    icon: Shield
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
  const baseStyles = "relative font-bold border-3 border-black px-6 py-3 transition-all duration-75 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none flex items-center justify-center gap-2 uppercase tracking-wider text-sm";
  
  const variants = {
    primary: "bg-stark-orange text-black shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] hover:bg-stark-orange-hover",
    secondary: "bg-nostr-purple text-white shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] hover:bg-nostr-purple-hover",
    outline: "bg-paper text-black shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] hover:bg-white",
    ghost: "border-transparent hover:bg-black/5"
  };

  return (
    <button onClick={onClick} className={`${baseStyles} ${variants[variant]} ${className}`}>
      {Icon && <Icon size={18} strokeWidth={3} />}
      <span>{children}</span>
    </button>
  );
};

const BrutalCard = ({ children, className = "", color = "bg-zk-blue-light" }: { children: React.ReactNode, className?: string, color?: string }) => (
  <div className={`border-3 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-6 ${color} ${className}`}>
    {children}
  </div>
);

const Badge = ({ children, color = "bg-gray-200", className = "" }: { children: React.ReactNode, color?: string, className?: string }) => (
  <span className={`inline-block border-2 border-black px-2 py-1 text-xs font-bold uppercase tracking-wider ${color} ${className}`}>
    {children}
  </span>
);

const StatusIndicator = ({ status }: { status: Job['status'] }) => {
  const styles = {
    pending: { color: 'bg-bitcoin-gold', icon: Clock, text: 'PENDING' },
    processing: { color: 'bg-blue-400', icon: Activity, text: 'COMPUTING' },
    proven: { color: 'bg-nostr-purple', icon: Shield, text: 'PROVEN' },
    verified: { color: 'bg-valid-green', icon: CheckCircle, text: 'VERIFIED' },
  };

  const { color, icon: Icon, text } = styles[status];

  return (
    <div className={`flex items-center gap-2 border-3 border-black px-3 py-1.5 ${color} text-black`}>
      <Icon size={16} strokeWidth={3} />
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
      variants={{ initial: { x: -100, y: -100, opacity: 0 }, animate: { x: 0, y: 0, opacity: 1 }}}
      transition={{ delay: 0.1, duration: 0.5 }}
    />
    <motion.div 
      className="absolute right-0 bottom-0 w-48 h-48 border-4 border-black bg-stark-orange"
      variants={{ initial: { x: 100, y: 100, opacity: 0 }, animate: { x: 0, y: 0, opacity: 1 }}}
      transition={{ delay: 0.2, duration: 0.5 }}
    />
    <motion.div 
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 border-4 border-black bg-paper flex items-center justify-center p-4"
      variants={{ initial: { scale: 0.5, opacity: 0 }, animate: { scale: 1, opacity: 1 }}}
      transition={{ delay: 0.4, duration: 0.5 }}
    >
      <div className="text-center">
        <Cpu size={64} strokeWidth={2} className="mx-auto mb-3 text-stark-orange"/>
        <div className="font-mono font-bold text-sm uppercase">STARK-PROVABLE</div>
        <div className="font-mono text-xs mt-1 text-gray-500">COMPUTATION MARKET</div>
        <div className="font-mono text-xs mt-2 bg-valid-green border-2 border-black inline-block px-2 py-0.5">STATUS: ONLINE</div>
      </div>
    </motion.div>
  </motion.div>
)

// --- Main Application ---

export default function App() {
  const [activeTab, setActiveTab] = useState<'market' | 'jobs'>('market');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [walletConnected, setWalletConnected] = useState(false);
  const toggleWallet = () => setWalletConnected(!walletConnected);

  const filteredServices = MOCK_SERVICES.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    s.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-paper text-black font-sans selection:bg-stark-orange selection:text-white">
      
      {/* --- Navigation --- */}
      <header className="sticky top-0 z-50 border-b-4 border-black bg-paper/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-black text-white flex items-center justify-center border-2 border-transparent">
              <Shield size={28} />
            </div>
            <h1 className="text-3xl font-black tracking-tighter uppercase hidden sm:block">
              SoulSociety<span className="text-stark-orange">.</span>
            </h1>
          </div>

          <div className="hidden lg:flex gap-6 items-center font-bold uppercase tracking-wider text-sm">
            <a href="#" className="hover:text-stark-orange transition-colors">Docs</a>
            <a href="#" className="hover:text-stark-orange transition-colors">Explorers</a>
            <a href="#" className="hover:text-stark-orange transition-colors">Stats</a>
          </div>

          <div className="flex items-center gap-4">
             <div className="hidden md:block">
                <BrutalButton 
                  variant={walletConnected ? 'outline' : 'primary'} 
                  onClick={toggleWallet}
                  className="py-2"
                  icon={walletConnected ? CheckCircle : Zap}
                >
                  {walletConnected ? 'npub1...8z9' : 'Connect'}
                </BrutalButton>
             </div>
             <button onClick={() => setSidebarOpen(true)} className="lg:hidden border-3 border-black p-2 bg-paper active:bg-gray-100 shadow-[3px_3px_0px_0px_#000] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all">
               <Menu size={24} strokeWidth={3}/>
             </button>
          </div>
        </div>
      </header>

      {/* --- Mobile Sidebar --- */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]"
            />
            <motion.div 
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed right-0 top-0 bottom-0 w-72 bg-paper border-l-4 border-black z-[70] p-6"
            >
              <div className="flex justify-between items-center mb-10">
                <h2 className="font-black text-2xl uppercase">Menu</h2>
                <button onClick={() => setSidebarOpen(false)} className="p-1 active:translate-x-[2px] active:translate-y-[2px]"><X size={32} /></button>
              </div>
              <div className="flex flex-col gap-6 text-xl font-bold uppercase tracking-wider">
                <a href="#" className="hover:text-stark-orange">Docs</a>
                <a href="#" className="hover:text-stark-orange">Explorers</a>
                <a href="#" className="hover:text-stark-orange">Stats</a>
                <hr className="border-black my-4 border-dashed" />
                <BrutalButton variant="primary" onClick={toggleWallet} className="w-full">
                  {walletConnected ? 'Disconnect' : 'Connect Nostr'}
                </BrutalButton>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* --- Main Content --- */}
      <main className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8 space-y-20">

        {/* --- Hero Section --- */}
        <section className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-center py-12 md:py-20 bg-bitcoin-gold border-4 border-black shadow-[10px_10px_0_#000]">
          <div className="lg:col-span-3 space-y-6 text-center lg:text-left p-8">
            <Badge color="bg-nostr-purple text-white" className="mx-auto lg:mx-0">Stark-Powered Trust</Badge>
            <h2 className="text-6xl md:text-8xl font-black leading-[0.9] uppercase text-black">
              Don't Trust.
              <br />
              <span className="bg-stark-orange px-4 text-white shadow-[8px_8px_0px_0px_#000] inline-block mt-2">
                Verify.
              </span>
            </h2>
            <p className="text-xl md:text-2xl font-medium max-w-2xl mx-auto lg:mx-0 border-l-4 border-black pl-4 py-2 mt-8">
              Integrity by default. Powered by STARKs. A permissionless marketplace for digital services.
            </p>
            <div className="flex flex-wrap justify-center lg:justify-start gap-4 pt-6">
              <BrutalButton icon={Terminal} variant="primary">
                Explore Market
              </BrutalButton>
              <BrutalButton variant="outline" icon={Database}>
                DVM Specs
              </BrutalButton>
            </div>
          </div>

          <div className="lg:col-span-2 relative hidden lg:block h-80">
            <SoulGeometry />
          </div>
        </section>

        {/* --- Dashboard Section --- */}
        <section className="border-y-4 border-black bg-nostr-purple text-white">
          <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8">
            <div className="flex flex-col md:flex-row justify-between items-center border-b-4 border-white pb-6 mb-8 gap-6">
              <div className="flex border-3 border-black shadow-[5px_5px_0_#000]">
                  <button 
                    onClick={() => setActiveTab('market')}
                    className={`text-xl font-black uppercase px-6 py-3 border-r-3 border-black transition-colors ${activeTab === 'market' ? 'bg-stark-orange text-white' : 'bg-paper text-black hover:bg-gray-100'}`}
                  >
                    Marketplace
                  </button>
                  <button 
                    onClick={() => setActiveTab('jobs')}
                    className={`text-xl font-black uppercase px-6 py-3 transition-colors relative ${activeTab === 'jobs' ? 'bg-stark-orange text-white' : 'bg-paper text-black hover:bg-gray-100'}`}
                  >
                    Live Jobs 
                    <span className="absolute -top-2 -right-2 text-xs h-6 w-6 flex items-center justify-center bg-bitcoin-gold text-black px-1.5 py-0.5 border-2 border-black font-bold rounded-full">
                      {MOCK_JOBS.length}
                    </span>
                  </button>
              </div>
              
              <div className="w-full md:w-auto relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-black/50" size={24} strokeWidth={3}/>
                  <input 
                    type="text" 
                    placeholder="Find a DVM by name or tag..." 
                    className="w-full md:w-96 border-3 border-black py-3 pl-14 pr-4 font-bold text-lg focus:outline-none focus:bg-white transition-all shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] focus:shadow-[8px_8px_0px_0px_#000] bg-paper"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
              </div>
            </div>

            {/* --- Tab Content --- */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.2 }}
                className="min-h-[400px]"
              >
                {activeTab === 'market' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {filteredServices.map((service, index) => (
                      <motion.div key={service.id} whileHover={{ y: -8, x: -8 }}>
                        <BrutalCard color={index % 2 === 0 ? 'bg-valid-green' : 'bg-zk-blue-light'} className="h-full flex flex-col group cursor-pointer transition-all duration-75 hover:shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]">
                          <div className="flex justify-between items-start mb-4">
                            <div className="p-3 border-3 border-black bg-paper shadow-[4px_4px_0_#000]">
                              <service.icon size={28} strokeWidth={2.5} className="text-stark-orange"/>
                            </div>
                            <Badge color="bg-paper text-black">{service.price}</Badge>
                          </div>
                          
                          <h3 className="text-2xl font-black uppercase mb-2 group-hover:text-paper transition-colors">{service.name}</h3>
                          <p className="text-base font-medium mb-4 flex-grow">{service.description}</p>
                          
                          <div className="space-y-3 font-mono text-sm border-t-2 border-black pt-4 mt-auto">
                            <div className="flex justify-between">
                              <span className="text-black/60">PROVIDER:</span>
                              <span className="font-bold truncate">{service.provider}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-black/60">LATENCY:</span>
                              <span className="font-bold">{service.latency}</span>
                            </div>
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            {service.tags.map(tag => (
                              <Badge key={tag} color="bg-paper text-black">#{tag}</Badge>
                            ))}
                          </div>
                          
                          <BrutalButton variant="primary" className="w-full mt-6 text-base bg-paper text-black hover:bg-stark-orange hover:text-white">
                            Request Proof
                          </BrutalButton>
                        </BrutalCard>
                      </motion.div>
                    ))}
                    {filteredServices.length === 0 && (
                       <div className="col-span-full text-center py-16">
                         <p className="text-2xl font-bold">No services found.</p>
                         <p className="text-gray-500">Try a different search query.</p>
                       </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {MOCK_JOBS.map((job) => (
                      <motion.div key={job.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: MOCK_JOBS.indexOf(job) * 0.1 }}>
                        <div className="border-3 border-black bg-paper p-4 shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                          <div className="flex items-start lg:items-center gap-4 w-full lg:w-auto">
                            <div className="p-3 border-3 border-black bg-zk-blue-light shadow-[3px_3px_0_#000]">
                              <Cpu size={24} strokeWidth={2.5}/>
                            </div>
                            <div className="flex-grow">
                              <div className="font-black text-xl uppercase text-black">
                                {MOCK_SERVICES.find(s => s.id === job.serviceId)?.name}
                              </div>
                              <div className="font-mono text-sm text-gray-500 flex items-center gap-2">
                                <span>ID: {job.id}</span>
                                <span className="text-gray-300">•</span>
                                <span>{job.timestamp}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full lg:w-auto">
                            {job.proofHash && (
                              <div className="font-mono text-xs bg-gray-100 p-2 border-2 border-black truncate flex-grow text-center">
                                HASH: <span className="font-bold">{job.proofHash}</span>
                              </div>
                            )}
                            <StatusIndicator status={job.status} />
                            <BrutalButton variant="outline" className="p-3 w-full sm:w-auto">
                              <ChevronRight size={24} strokeWidth={3}/>
                            </BrutalButton>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                    <div className="border-4 border-black border-dashed p-10 text-center bg-paper/50">
                      <p className="text-lg font-bold text-gray-500 animate-pulse">Listening for new DVM events (Kind 6600)...</p>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </section>

        {/* --- Footer --- */}
        <footer className="border-t-4 border-black mt-20 bg-white">
          <div className="max-w-7xl mx-auto p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
                <div className="lg:col-span-2">
                  <h2 className="text-4xl font-black uppercase mb-4">SoulSociety.</h2>
                  <p className="font-medium text-lg max-w-md">
                    A permissionless marketplace of digital services, providing integrity by default thanks to the power of STARKs.
                  </p>
                </div>
                <div>
                  <h3 className="font-black text-xl border-b-3 border-black inline-block mb-4 uppercase">Protocol</h3>
                  <ul className="space-y-3 text-base font-medium">
                      <li><a href="#" className="hover:text-stark-orange">NIP-90 (DVMs)</a></li>
                      <li><a href="#" className="hover:text-stark-orange">Circle STARKs</a></li>
                      <li><a href="#" className="hover:text-stark-orange">Cairo Lang</a></li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-black text-xl border-b-3 border-black inline-block mb-4 uppercase">Community</h3>
                  <ul className="space-y-3 text-base font-medium">
                      <li><a href="#" className="hover:text-stark-orange">Github</a></li>
                      <li><a href="#" className="hover:text-stark-orange">Nostr</a></li>
                      <li><a href="#" className="hover:text-stark-orange">Telegram</a></li>
                  </ul>
                </div>
            </div>
            <div className="mt-16 pt-8 border-t-2 border-black border-dashed font-mono text-sm text-center md:text-left">
                © 2025 SOULSOCIETY. NO RIGHTS RESERVED. OPEN SOURCE.
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
