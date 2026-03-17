/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Wifi, 
  Clock, 
  CreditCard, 
  Phone, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle,
  LogOut,
  BookOpen,
  Database,
  Infinity,
  Repeat,
  ShieldCheck,
  Zap,
  Users,
  Trophy,
  Calendar,
  Key
} from 'lucide-react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  onSnapshot, 
  query, 
  where, 
  addDoc, 
  getDocFromServer,
  Timestamp
} from 'firebase/firestore';
import { addMinutes, isAfter, differenceInSeconds } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db } from './firebase';
import { cn } from './lib/utils';

// Operation types for error handling
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export const handleFirestoreError = (error: any, operationType: OperationType, path: string | null) => {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  return errInfo.error;
};

// Components
const MastIcon = ({ className }: { className?: string }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M12 2v20" />
    <path d="m12 2-5 20" />
    <path d="m12 2 5 20" />
    <path d="M8.5 16h7" />
    <path d="M10 10h4" />
    <circle cx="12" cy="2" r="1" fill="currentColor" />
    <path d="M15 5c1.5 0 2.5 1 2.5 2.5" />
    <path d="M17 3c2.5 0 4.5 2 4.5 4.5" />
    <path d="M9 5C7.5 5 6.5 6 6.5 7.5" />
    <path d="M7 3C4.5 3 2.5 5 2.5 7.5" />
  </svg>
);

// Types
interface Plan {
  id: string;
  name: string;
  price: number;
  durationHours: number;
  description: string;
  type: 'standard' | 'special' | 'free';
  icon: React.ReactNode;
  isFlexible?: boolean;
  isMaster?: boolean;
}

interface Subscription {
  id: string;
  userId: string;
  planId: string;
  startTime: Timestamp;
  endTime: Timestamp;
  status: 'active' | 'expired';
}

interface UserProfile {
  uid: string;
  phoneNumber: string;
  displayName: string;
  role: 'admin' | 'user';
  hasUsedFreeTrial: boolean;
  balance?: number;
  simProvider?: 'airtel' | 'mtn';
  isMaster?: boolean;
}

interface Transaction {
  id: string;
  userId: string;
  amount: number;
  type: 'deposit' | 'subscription';
  status: 'completed' | 'pending';
  timestamp: Timestamp;
  planName?: string;
  phone?: string;
}

interface WhitelistedDevice {
  id: string;
  macAddress: string;
  userId: string;
  userName: string;
  expiry: Timestamp;
  planName: string;
}

const PLANS: Plan[] = [
  {
    id: 'free-trial',
    name: 'Free Trial',
    price: 0,
    durationHours: 0.0833, // 5 minutes
    description: '5 minutes free for new entrants',
    type: 'free',
    icon: <Zap className="w-5 h-5" />
  },
  {
    id: 'football-match',
    name: 'Football Match',
    price: 300,
    durationHours: 2.5,
    description: '2.5 hours of high speed football action',
    type: 'special',
    icon: <Trophy className="w-5 h-5" />
  },
  {
    id: 'one-hour',
    name: '1 Hour Power',
    price: 500,
    durationHours: 1,
    description: 'Quick 1-hour unlimited data burst',
    type: 'standard',
    icon: <Clock className="w-5 h-5" />
  },
  {
    id: 'two-hours',
    name: '2 Hours Pro',
    price: 800,
    durationHours: 2,
    description: '2 hours of uninterrupted connectivity',
    type: 'standard',
    icon: <Clock className="w-5 h-5" />
  },
  {
    id: 'three-hours-loop',
    name: '3 Hours Loop',
    price: 0,
    isFlexible: true,
    durationHours: 3,
    description: '3 hours of unlimited loop data (Flexible Fee)',
    type: 'special',
    icon: <Infinity className="w-5 h-5" />
  },
  {
    id: 'six-hours-loop',
    name: '6 Hours Loop',
    price: 0,
    isFlexible: true,
    durationHours: 6,
    description: '6 hours of unlimited loop data (Flexible Fee)',
    type: 'special',
    icon: <Infinity className="w-5 h-5" />
  },
  {
    id: 'students-package',
    name: 'Students Package',
    price: 1500,
    durationHours: 12,
    description: 'Special 12-hour data for students',
    type: 'special',
    icon: <BookOpen className="w-5 h-5" />
  },
  {
    id: 'daily-offer',
    name: 'Daily Offer',
    price: 2000,
    durationHours: 24,
    description: 'Unlimited data for 24 hours',
    type: 'standard',
    icon: <Clock className="w-5 h-5" />
  },
  {
    id: 'family-weekend',
    name: 'Family Weekend',
    price: 4000,
    durationHours: 48,
    description: 'Special weekend unlimited for the family',
    type: 'special',
    icon: <Users className="w-5 h-5" />
  },
  {
    id: 'weekly-offer',
    name: 'Weekly Offer',
    price: 10000,
    durationHours: 168,
    description: 'Unlimited data for 7 days',
    type: 'standard',
    icon: <Calendar className="w-5 h-5" />
  },
  {
    id: 'monthly-offer',
    name: 'Monthly Offer',
    price: 35000,
    durationHours: 720,
    description: 'Unlimited data for 30 days',
    type: 'standard',
    icon: <ShieldCheck className="w-5 h-5" />
  },
  {
    id: 'master-key',
    name: 'Master Key',
    price: 50000,
    durationHours: 720,
    description: 'Universal master access for all network nodes',
    type: 'special',
    icon: <Key className="w-5 h-5" />,
    isMaster: true
  }
];

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activeSub, setActiveSub] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [showPaymentAlert, setShowPaymentAlert] = useState<Plan | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [hubStatus, setHubStatus] = useState<{ online: boolean; message: string } | null>(null);
  const [customAmount, setCustomAmount] = useState<string>('1000');

  useEffect(() => {
    const checkHub = async () => {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        setHubStatus(data);
      } catch (err) {
        setHubStatus({ online: false, message: "Hub Offline - Connection Error" });
      }
    };
    if (profile?.role === 'admin') {
      checkHub();
      const interval = setInterval(checkHub, 30000);
      return () => clearInterval(interval);
    }
  }, [profile]);
  
  // Payment Flow States
  const [paymentStep, setPaymentStep] = useState<'input' | 'processing' | 'success' | 'connecting'>('input');
  const [momoNumber, setMomoNumber] = useState('');
  const [macAddress, setMacAddress] = useState('');
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'admin' | 'history'>('dashboard');
  const [adminUsers, setAdminUsers] = useState<UserProfile[]>([]);
  const [adminSubs, setAdminSubs] = useState<any[]>([]);
  const [userTransactions, setUserTransactions] = useState<Transaction[]>([]);
  const [whitelistedDevices, setWhitelistedDevices] = useState<WhitelistedDevice[]>([]);
  const [smsSettings, setSmsSettings] = useState({ enabled: false, apiKey: '', senderId: 'KONECT' });
  const [isSyncing, setIsSyncing] = useState(false);

  // Initial Auth & Data Fetching
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (!firebaseUser) {
        setProfile(null);
        setActiveSub(null);
        setLoading(false);
        return;
      }

      const isAdminEmail = firebaseUser.email === "juliustindimwebwa54@gmail.com";

      const fetchProfile = async () => {
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          let currentProfile: UserProfile;

          if (userDoc.exists()) {
            currentProfile = userDoc.data() as UserProfile;
            if (isAdminEmail && currentProfile.role !== 'admin') {
              currentProfile.role = 'admin';
              await setDoc(doc(db, 'users', firebaseUser.uid), currentProfile, { merge: true });
            }
          } else {
            currentProfile = {
              uid: firebaseUser.uid,
              phoneNumber: isAdminEmail ? '+256752204727' : (firebaseUser.phoneNumber || ''),
              displayName: firebaseUser.displayName || 'User',
              role: isAdminEmail ? 'admin' : 'user',
              hasUsedFreeTrial: false,
              balance: isAdminEmail ? 50000 : 0,
              simProvider: isAdminEmail ? 'airtel' : 'mtn'
            };
            await setDoc(doc(db, 'users', firebaseUser.uid), currentProfile);
          }
          setProfile(currentProfile);
          setMomoNumber(currentProfile.phoneNumber || '');

          // Auto-sync plans for admin
          if (isAdminEmail && syncStatus === 'idle') {
            setSyncStatus('syncing');
            try {
              for (const plan of PLANS) {
                const { icon, ...planData } = plan;
                await setDoc(doc(db, 'plans', plan.id), planData);
              }
              setSyncStatus('success');
            } catch (err) {
              console.error("Auto-sync failed:", err);
              setSyncStatus('error');
            }
          }
        } catch (err) {
          console.error("Profile fetch error:", err);
        }
      };

      fetchProfile();

      // Listen for active subscription
      const q = query(
        collection(db, 'subscriptions'),
        where('userId', '==', firebaseUser.uid),
        where('status', '==', 'active')
      );

      const subUnsubscribe = onSnapshot(q, (snapshot) => {
        const subs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Subscription));
        const current = subs.find(s => isAfter(s.endTime.toDate(), new Date()));
        setActiveSub(current || null);
        setLoading(false);
      }, (err) => {
        setLoading(false);
      });

      // User transactions listener
      const txUnsub = onSnapshot(
        query(collection(db, 'transactions'), where('userId', '==', firebaseUser.uid)),
        (snapshot) => {
          setUserTransactions(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Transaction))
            .sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis()));
        }
      );

      // Admin data listeners
      let adminUsersUnsub: () => void = () => {};
      let adminSubsUnsub: () => void = () => {};
      let devicesUnsub: () => void = () => {};
      let settingsUnsub: () => void = () => {};

      if (isAdminEmail) {
        adminUsersUnsub = onSnapshot(collection(db, 'users'), (snapshot) => {
          setAdminUsers(snapshot.docs.map(d => d.data() as UserProfile));
        });
        adminSubsUnsub = onSnapshot(collection(db, 'subscriptions'), (snapshot) => {
          setAdminSubs(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        devicesUnsub = onSnapshot(collection(db, 'subscriptions'), (snapshot) => {
          const activeDevices = snapshot.docs
            .map(d => ({ id: d.id, ...d.data() } as any))
            .filter(d => isAfter(d.endTime.toDate(), new Date()))
            .map(d => ({
              id: d.id,
              macAddress: d.macAddress,
              userId: d.userId,
              userName: d.userName || 'Unknown',
              expiry: d.endTime,
              planName: PLANS.find(p => p.id === d.planId)?.name || 'Unknown'
            }));
          setWhitelistedDevices(activeDevices);
        });
        settingsUnsub = onSnapshot(doc(db, 'settings', 'sms'), (snapshot) => {
          if (snapshot.exists()) setSmsSettings(snapshot.data() as any);
        });
      }

      return () => {
        subUnsubscribe();
        txUnsub();
        adminUsersUnsub();
        adminSubsUnsub();
        devicesUnsub();
        settingsUnsub();
      };
    });

    return () => unsubscribe();
  }, []);

  // Timer logic
  useEffect(() => {
    if (!activeSub) {
      setTimeLeft('');
      return;
    }

    const interval = setInterval(() => {
      const now = new Date();
      const end = activeSub.endTime.toDate();
      const diff = differenceInSeconds(end, now);

      if (diff <= 0) {
        setTimeLeft('Expired');
        clearInterval(interval);
      } else {
        const h = Math.floor(diff / 3600);
        const m = Math.floor((diff % 3600) / 60);
        const s = diff % 60;
        setTimeLeft(`${h}h ${m}m ${s}s`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activeSub]);

  const handleLogin = async () => {
    try {
      setError(null);
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error("Login Error:", err);
      if (err.code === 'auth/popup-blocked') {
        setError("Login popup was blocked by your browser. Please allow popups for this site.");
      } else {
        setError(`Failed to login: ${err.message || "Unknown error"}`);
      }
    }
  };

  const handleLogout = () => signOut(auth);

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      for (const plan of PLANS) {
        const { icon, ...planData } = plan;
        await setDoc(doc(db, 'plans', plan.id), planData);
      }
      setSyncStatus('success');
      setTimeout(() => setSyncStatus('idle'), 3000);
    } catch (err) {
      setSyncStatus('error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUpdateUserBalance = async (uid: string, currentBalance: number) => {
    const amount = prompt("Enter new balance (UGX):", currentBalance.toString());
    if (amount !== null && !isNaN(Number(amount))) {
      try {
        await setDoc(doc(db, 'users', uid), { balance: Number(amount) }, { merge: true });
      } catch (err) {
        setError("Failed to update user balance.");
      }
    }
  };

  const handleToggleMasterKey = async (uid: string, currentStatus: boolean) => {
    try {
      await setDoc(doc(db, 'users', uid), { isMaster: !currentStatus }, { merge: true });
    } catch (err) {
      setError("Failed to update Master Key status.");
    }
  };

  const handleUpdateSmsSettings = async () => {
    try {
      await setDoc(doc(db, 'settings', 'sms'), smsSettings);
      alert("SMS Settings updated!");
    } catch (err) {
      setError("Failed to update SMS settings.");
    }
  };

  const handleAddFunds = async () => {
    if (!user || !profile) return;
    const amount = prompt("Enter amount to add (UGX):", "10000");
    if (amount && !isNaN(Number(amount))) {
      try {
        const newBalance = (profile.balance || 0) + Number(amount);
        await setDoc(doc(db, 'users', user.uid), { balance: newBalance }, { merge: true });
        setProfile({ ...profile, balance: newBalance });
      } catch (err) {
        setError("Failed to update balance.");
      }
    }
  };

  const resetPaymentFlow = () => {
    setShowPaymentAlert(null);
    setPaymentStep('input');
    setPaymentError(null);
  };

  const handleInitiatePayment = async () => {
    if (!momoNumber || momoNumber.length < 10) {
      setPaymentError("Please enter a valid Mobile Money number.");
      return;
    }
    if (!macAddress || !/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(macAddress)) {
      setPaymentError("Please enter a valid MAC address (e.g. AA:BB:CC:DD:EE:FF).");
      return;
    }

    setPaymentError(null);
    setPaymentStep('processing');
    
    const price = showPaymentAlert?.isFlexible ? Number(customAmount) : (showPaymentAlert?.price || 0);

    // AUTOMATIC BILLING: If user has enough balance, use it directly
    if (profile && (profile.balance || 0) >= price) {
      try {
        const newBalance = (profile.balance || 0) - price;
        await setDoc(doc(db, 'users', profile.uid), { balance: newBalance }, { merge: true });
        setProfile({ ...profile, balance: newBalance });
        setPaymentStep('success');
        return;
      } catch (err) {
        setPaymentError("Failed to deduct balance. Please try again.");
        setPaymentStep('input');
        return;
      }
    }
    
    // Simulate payment gateway delay for external MoMo
    await new Promise(resolve => setTimeout(resolve, 3000));
    setPaymentStep('success');
  };

  const handleConnectToWifi = async () => {
    if (!showPaymentAlert || !user || !profile) return;
    
    setPaymentStep('connecting');
    
    // Simulate gateway whitelisting
    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
      const startTime = new Date();
      const endTime = addMinutes(startTime, showPaymentAlert.durationHours * 60);

      const subData = {
        userId: user.uid,
        userName: user.displayName,
        planId: showPaymentAlert.id,
        startTime: Timestamp.fromDate(startTime),
        endTime: Timestamp.fromDate(endTime),
        status: 'active',
        macAddress: macAddress,
        momoNumber: momoNumber,
        createdAt: Timestamp.now()
      };

      await addDoc(collection(db, 'subscriptions'), subData);

      // Add to transactions
      await addDoc(collection(db, 'transactions'), {
        userId: user.uid,
        amount: showPaymentAlert.isFlexible ? Number(customAmount) : showPaymentAlert.price,
        type: 'subscription',
        status: 'completed',
        planName: showPaymentAlert.name,
        timestamp: Timestamp.now()
      });

      if (showPaymentAlert.id === 'free-trial') {
        await setDoc(doc(db, 'users', user.uid), { hasUsedFreeTrial: true }, { merge: true });
        setProfile({ ...profile, hasUsedFreeTrial: true });
      }

      resetPaymentFlow();
    } catch (err) {
      setError("Failed to activate connection. Please contact support.");
      setPaymentStep('success');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            <div className="w-16 h-16 border-2 border-emerald-500/20 rounded-full"></div>
            <div className="absolute inset-0 border-t-2 border-emerald-500 rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <MastIcon className="w-6 h-6 text-emerald-500" />
            </div>
          </div>
          <p className="text-emerald-500 font-mono text-xs uppercase tracking-[0.3em] animate-pulse">Initializing Data Empire...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 font-sans selection:bg-emerald-500/30">
      {/* Admin Sync Status Banner */}
      {user?.email === "juliustindimwebwa54@gmail.com" && syncStatus !== 'idle' && (
        <div className={cn(
          "py-2 px-4 text-center text-xs font-bold uppercase tracking-widest transition-colors",
          syncStatus === 'syncing' && "bg-amber-500 text-black",
          syncStatus === 'success' && "bg-emerald-500 text-black",
          syncStatus === 'error' && "bg-red-500 text-white"
        )}>
          {syncStatus === 'syncing' && "⚙️ Syncing Billing Plans..."}
          {syncStatus === 'success' && "✅ Billing System Ready"}
          {syncStatus === 'error' && "❌ Sync Failed"}
        </div>
      )}

      {/* Header */}
      <nav className="border-b border-white/5 bg-black/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-emerald-500 p-1.5 rounded-lg">
              <MastIcon className="w-5 h-5 text-black" />
            </div>
            <span className="font-bold text-lg tracking-tight">KONECT <span className="text-emerald-500">SATELLITE</span></span>
          </div>
          
          {user ? (
            <div className="flex items-center gap-4">
              {profile?.role === 'admin' && (
                <div className="flex bg-white/5 p-1 rounded-xl border border-white/10 mr-4">
                  <button 
                    onClick={() => setActiveTab('dashboard')}
                    className={cn(
                      "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                      activeTab === 'dashboard' ? "bg-emerald-500 text-black shadow-lg" : "text-zinc-400 hover:text-white"
                    )}
                  >
                    User
                  </button>
                  <button 
                    onClick={() => setActiveTab('history')}
                    className={cn(
                      "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                      activeTab === 'history' ? "bg-emerald-500 text-black shadow-lg" : "text-zinc-400 hover:text-white"
                    )}
                  >
                    History
                  </button>
                  <button 
                    onClick={() => setActiveTab('admin')}
                    className={cn(
                      "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                      activeTab === 'admin' ? "bg-emerald-500 text-black shadow-lg" : "text-zinc-400 hover:text-white"
                    )}
                  >
                    Admin
                  </button>
                </div>
              )}
              {user && profile?.role !== 'admin' && (
                <button 
                  onClick={() => setActiveTab(activeTab === 'dashboard' ? 'history' : 'dashboard')}
                  className="bg-white/5 border border-white/10 px-4 py-1.5 rounded-xl text-xs font-bold hover:bg-white/10 transition-all mr-4"
                >
                  {activeTab === 'dashboard' ? 'My History' : 'Dashboard'}
                </button>
              )}
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-xs text-zinc-500 font-mono uppercase tracking-tighter">Connected as</span>
                <span className="text-sm font-medium">{user.displayName}</span>
              </div>
              <button 
                onClick={handleLogout}
                className="p-2 hover:bg-white/5 rounded-full transition-colors"
              >
                <LogOut className="w-5 h-5 text-zinc-400" />
              </button>
            </div>
          ) : (
            <button 
              onClick={handleLogin}
              className="bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-2 rounded-full text-sm font-bold transition-all flex items-center gap-2"
            >
              Sign In <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {activeTab === 'history' ? (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold tracking-tight mb-2">Transaction History</h1>
                <p className="text-zinc-500">Your past payments and plan activations.</p>
              </div>
              <button 
                onClick={() => setActiveTab('dashboard')}
                className="text-emerald-500 font-bold text-sm hover:underline"
              >
                Back to Dashboard
              </button>
            </div>

            <div className="bg-zinc-900/50 border border-white/5 rounded-3xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/5 bg-white/5">
                      <th className="px-6 py-4 text-xs font-mono uppercase text-zinc-500">Date</th>
                      <th className="px-6 py-4 text-xs font-mono uppercase text-zinc-500">Type</th>
                      <th className="px-6 py-4 text-xs font-mono uppercase text-zinc-500">Amount</th>
                      <th className="px-6 py-4 text-xs font-mono uppercase text-zinc-500">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {userTransactions.length > 0 ? userTransactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4 text-sm text-zinc-400">
                          {tx.timestamp.toDate().toLocaleDateString()} {tx.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="font-medium capitalize">{tx.type}</span>
                            {tx.planName && <span className="text-[10px] text-zinc-500">{tx.planName}</span>}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "font-bold",
                            tx.type === 'deposit' ? "text-emerald-500" : "text-zinc-100"
                          )}>
                            {tx.type === 'deposit' ? '+' : '-'}{tx.amount.toLocaleString()} UGX
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 bg-emerald-500/10 text-emerald-500 text-[10px] font-bold uppercase rounded-md">
                            {tx.status}
                          </span>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={4} className="px-6 py-12 text-center text-zinc-500 italic">
                          No transactions found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : activeTab === 'admin' && profile?.role === 'admin' ? (
          <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Admin Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <h1 className="text-4xl font-bold tracking-tight mb-2">Admin Dashboard</h1>
                <p className="text-zinc-500">System management and user oversight.</p>
              </div>
              <button 
                onClick={handleManualSync}
                disabled={isSyncing}
                className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black px-6 py-3 rounded-2xl font-bold flex items-center gap-2 transition-all"
              >
                <Database className={cn("w-5 h-5", isSyncing && "animate-spin")} />
                Sync Billing System
              </button>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white/5 border border-white/10 p-6 rounded-3xl">
                <p className="text-xs text-zinc-500 font-mono uppercase mb-1">Total Users</p>
                <p className="text-3xl font-bold">{adminUsers.length}</p>
              </div>
              <div className="bg-white/5 border border-white/10 p-6 rounded-3xl">
                <p className="text-xs text-zinc-500 font-mono uppercase mb-1">Active Subs</p>
                <p className="text-3xl font-bold">
                  {adminSubs.filter(s => s.status === 'active' && isAfter(s.endTime.toDate(), new Date())).length}
                </p>
              </div>
              <div className="bg-white/5 border border-white/10 p-6 rounded-3xl">
                <p className="text-xs text-zinc-500 font-mono uppercase mb-1">Total Revenue</p>
                <p className="text-3xl font-bold text-emerald-500">
                  {adminSubs.reduce((acc, s) => acc + (PLANS.find(p => p.id === s.planId)?.price || 0), 0).toLocaleString()} <span className="text-xs font-normal">UGX</span>
                </p>
              </div>
              <div className="bg-white/5 border border-white/10 p-6 rounded-3xl">
                <p className="text-xs text-zinc-500 font-mono uppercase mb-1">System Health</p>
                <p className="text-3xl font-bold text-emerald-500">100%</p>
              </div>
            </div>

            {/* User Management */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div>
                <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                  <Users className="w-6 h-6 text-emerald-500" /> User Management
                </h2>
                <div className="bg-zinc-900/50 border border-white/5 rounded-3xl overflow-hidden">
                  <div className="max-h-[400px] overflow-y-auto">
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 bg-zinc-900 z-10">
                        <tr className="border-b border-white/5 bg-white/5">
                          <th className="px-6 py-4 text-xs font-mono uppercase text-zinc-500">User</th>
                          <th className="px-6 py-4 text-xs font-mono uppercase text-zinc-500">Balance</th>
                          <th className="px-6 py-4 text-xs font-mono uppercase text-zinc-500">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {adminUsers.map((u) => (
                          <tr key={u.uid} className="hover:bg-white/5 transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex flex-col">
                                <span className="font-medium text-sm">{u.displayName}</span>
                                <span className="text-[10px] text-zinc-500 font-mono">{u.phoneNumber || 'No Phone'}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className="font-bold text-emerald-500 text-sm">{(u.balance || 0).toLocaleString()}</span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-col gap-1">
                                <button 
                                  onClick={() => handleUpdateUserBalance(u.uid, u.balance || 0)}
                                  className="text-[10px] font-bold text-emerald-500 hover:underline text-left"
                                >
                                  Adjust Balance
                                </button>
                                <button 
                                  onClick={() => handleToggleMasterKey(u.uid, u.isMaster || false)}
                                  className={cn(
                                    "text-[10px] font-bold hover:underline text-left",
                                    u.isMaster ? "text-yellow-500" : "text-zinc-500"
                                  )}
                                >
                                  {u.isMaster ? "Revoke Master" : "Grant Master"}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div>
                <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                  <ShieldCheck className="w-6 h-6 text-emerald-500" /> Whitelisted Devices
                </h2>
                <div className="bg-zinc-900/50 border border-white/5 rounded-3xl overflow-hidden">
                  <div className="max-h-[400px] overflow-y-auto">
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 bg-zinc-900 z-10">
                        <tr className="border-b border-white/5 bg-white/5">
                          <th className="px-6 py-4 text-xs font-mono uppercase text-zinc-500">MAC Address</th>
                          <th className="px-6 py-4 text-xs font-mono uppercase text-zinc-500">Owner</th>
                          <th className="px-6 py-4 text-xs font-mono uppercase text-zinc-500">Expiry</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {whitelistedDevices.length > 0 ? whitelistedDevices.map((d) => (
                          <tr key={d.id} className="hover:bg-white/5 transition-colors">
                            <td className="px-6 py-4">
                              <span className="font-mono text-emerald-500 text-sm">{d.macAddress}</span>
                            </td>
                            <td className="px-6 py-4 text-sm text-zinc-400">{d.userName}</td>
                            <td className="px-6 py-4 text-[10px] text-zinc-500">
                              {d.expiry.toDate().toLocaleDateString()}
                            </td>
                          </tr>
                        )) : (
                          <tr>
                            <td colSpan={3} className="px-6 py-12 text-center text-zinc-500 italic">
                              No active whitelisted devices.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </section>

            {/* Automation Settings */}
            <section className="bg-emerald-500/5 border border-emerald-500/20 p-8 rounded-3xl">
              <h2 className="text-2xl font-bold mb-6">System Configuration</h2>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                  <div>
                    <h3 className="text-lg font-bold mb-4">SMS Gateway Integration (Optional)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div className="flex items-center gap-3 p-4 bg-black/50 rounded-2xl border border-white/10">
                        <input 
                          type="checkbox" 
                          checked={smsSettings.enabled}
                          onChange={(e) => setSmsSettings({ ...smsSettings, enabled: e.target.checked })}
                          className="w-5 h-5 accent-emerald-500"
                        />
                        <span className="text-sm font-medium">Enable SMS Notifications</span>
                      </div>
                      <input 
                        type="text"
                        placeholder="Sender ID (e.g. KONECT)"
                        value={smsSettings.senderId}
                        onChange={(e) => setSmsSettings({ ...smsSettings, senderId: e.target.value })}
                        className="bg-black/50 border border-white/10 rounded-xl px-4 py-3 focus:border-emerald-500 outline-none transition-colors text-sm"
                      />
                    </div>
                    <div className="flex gap-4">
                      <input 
                        type="password"
                        placeholder="SMS Gateway API Key"
                        value={smsSettings.apiKey}
                        onChange={(e) => setSmsSettings({ ...smsSettings, apiKey: e.target.value })}
                        className="flex-1 bg-black/50 border border-white/10 rounded-xl px-4 py-3 focus:border-emerald-500 outline-none transition-colors text-sm"
                      />
                      <button 
                        onClick={handleUpdateSmsSettings}
                        className="bg-emerald-500 hover:bg-emerald-400 text-black px-6 py-3 rounded-xl font-bold text-xs transition-all"
                      >
                        Save Settings
                      </button>
                    </div>
                    <p className="text-zinc-500 text-[10px] mt-2">
                      Currently supports Twilio or generic HTTP SMS gateways. Leave disabled to skip SMS costs.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center justify-between p-4 bg-black/50 rounded-2xl border border-white/10">
                      <div className="flex items-center gap-3">
                        <div className={cn("w-2 h-2 rounded-full animate-pulse", hubStatus?.online ? "bg-emerald-500" : "bg-red-500")}></div>
                        <span className="text-sm font-medium">Zanta Hub Status</span>
                      </div>
                      <span className={cn("text-[10px] font-bold uppercase", hubStatus?.online ? "text-emerald-500" : "text-red-500")}>
                        {hubStatus?.online ? "Active" : "Offline"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-black/50 rounded-2xl border border-white/10">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                        <span className="text-sm font-medium">App Sharing Hub</span>
                      </div>
                      <button 
                        onClick={() => window.open('/api/share', '_blank')}
                        className="text-[10px] font-bold text-emerald-500 uppercase hover:underline"
                      >
                        Open QR Share
                      </button>
                    </div>
                  </div>
                </div>

                <div className="bg-black/30 p-6 rounded-2xl border border-white/10">
                  <h3 className="text-lg font-bold mb-4">Integration Guide</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed mb-4">
                    1. Use MacroDroid to forward MoMo SMS to the webhook.<br/>
                    2. Enable SMS Gateway to notify users of top-ups.<br/>
                    3. MAC whitelisting is handled automatically upon plan activation.
                  </p>
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                    <p className="text-[10px] font-mono text-zinc-500 mb-2">Endpoint URL:</p>
                    <code className="text-[10px] text-emerald-500 break-all">{window.location.origin}/api/webhook/airtel-money</code>
                  </div>
                </div>
              </div>
            </section>
          </div>
        ) : (
          <>
            {/* Automation & Integration Section (Admin Only) */}
        {profile?.role === 'admin' && (
          <section className="mb-12">
            <div className="bg-emerald-500/5 border border-emerald-500/20 p-8 rounded-3xl">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="bg-emerald-500/20 p-2 rounded-lg">
                    <Zap className="w-5 h-5 text-emerald-500" />
                  </div>
                  <h2 className="text-2xl font-bold">Automation & Integration</h2>
                </div>
                <div className="flex gap-2">
                  <span className="px-3 py-1 bg-emerald-500/10 text-emerald-500 text-[10px] font-bold uppercase rounded-full border border-emerald-500/20">
                    Airtel Ready
                  </span>
                  <span className="px-3 py-1 bg-yellow-500/10 text-yellow-500 text-[10px] font-bold uppercase rounded-full border border-yellow-500/20">
                    MTN Ready
                  </span>
                </div>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-lg font-bold mb-3">Webhook Endpoint</h3>
                  <div className="bg-black/50 p-4 rounded-xl border border-white/10 flex items-center justify-between group">
                    <code className="text-emerald-500 font-mono text-sm break-all">
                      {window.location.origin}/api/webhook/airtel-money
                    </code>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/api/webhook/airtel-money`);
                        alert("Copied to clipboard!");
                      }}
                      className="ml-4 p-2 hover:bg-white/10 rounded-lg transition-colors"
                    >
                      <Database className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-zinc-500 text-xs mt-3">
                    Configure your SMS forwarding app (MacroDroid) to POST to this URL.
                  </p>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-bold">Price Mapping</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {PLANS.filter(p => p.price > 0).map(p => (
                      <div key={p.id} className="bg-white/5 p-3 rounded-xl border border-white/10 flex justify-between items-center">
                        <span className="text-xs text-zinc-400">{p.name}</span>
                        <span className="text-xs font-bold text-emerald-500">{p.price} UGX</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Status Section */}
        <section className="mb-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* User Profile Card */}
            <div className="bg-gradient-to-br from-emerald-500/10 to-black border border-emerald-500/20 p-8 rounded-3xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                <CreditCard className="w-24 h-24 text-emerald-500" />
              </div>
              <div className="relative z-10">
                <p className="text-xs text-emerald-500 font-mono uppercase mb-1 tracking-widest">Account Balance</p>
                <h2 className="text-4xl font-bold mb-2">
                  {profile?.balance?.toLocaleString() || '0'} <span className="text-sm font-normal text-zinc-500">UGX</span>
                </h2>
                <p className="text-zinc-500 text-xs mb-6 font-mono">SIM: {profile?.phoneNumber || 'Not Linked'}</p>
                
                {profile?.isMaster && (
                  <div className="mb-6 flex items-center gap-2 bg-emerald-500/20 border border-emerald-500/30 px-3 py-2 rounded-xl">
                    <Key className="w-4 h-4 text-emerald-500" />
                    <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Master Key Active</span>
                  </div>
                )}

                <div className="flex gap-3">
                  <button 
                    onClick={handleAddFunds}
                    className="bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-2 rounded-xl text-xs font-bold transition-all"
                  >
                    Top Up
                  </button>
                </div>
              </div>
            </div>

            <div className="md:col-span-2 bg-gradient-to-br from-zinc-900 to-black border border-white/5 p-8 rounded-3xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                <MastIcon className="w-32 h-32" />
              </div>
              
              <div className="relative z-10">
                <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">
                  {activeSub ? "You are Online" : "Connection Required"}
                </h1>
                <p className="text-zinc-400 max-w-md mb-8">
                  Experience unlimited satellite data with 5 Mbps download and 3 Mbps upload speeds.
                </p>
                
                {activeSub ? (
                  <div className="flex flex-wrap gap-4">
                    <div className="bg-emerald-500/10 border border-emerald-500/20 px-6 py-4 rounded-2xl">
                      <p className="text-xs text-emerald-500 font-mono uppercase mb-1">Time Remaining</p>
                      <p className="text-2xl font-bold font-mono">{timeLeft}</p>
                    </div>
                    <div className="bg-white/5 border border-white/10 px-6 py-4 rounded-2xl">
                      <p className="text-xs text-zinc-500 font-mono uppercase mb-1">Active Plan</p>
                      <p className="text-2xl font-bold">{PLANS.find(p => p.id === activeSub.planId)?.name}</p>
                    </div>
                  </div>
                ) : (
                  <button 
                    onClick={() => document.getElementById('plans')?.scrollIntoView({ behavior: 'smooth' })}
                    className="bg-white text-black px-8 py-4 rounded-2xl font-bold hover:scale-105 transition-transform flex items-center gap-2"
                  >
                    Get Connected <Zap className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>

            <div className="bg-zinc-900/50 border border-white/5 p-8 rounded-3xl flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <Phone className="w-5 h-5 text-emerald-500" /> Support
                </h3>
                <p className="text-zinc-400 text-sm mb-6">
                  Having issues with your connection? Contact our support team directly.
                </p>
                <a 
                  href="tel:+256752204727" 
                  className="text-xl font-mono font-bold text-emerald-500 hover:underline"
                >
                  +256 752 204727
                </a>
              </div>
              <div className="mt-8 pt-6 border-t border-white/5">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-zinc-500">Download</span>
                  <span className="font-mono">5.0 Mbps</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Upload</span>
                  <span className="font-mono">3.0 Mbps</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Plans Grid */}
        <section id="plans" className="mb-12">
          <div className="flex items-end justify-between mb-8">
            <div>
              <h2 className="text-3xl font-bold tracking-tight mb-2">Billing Plans</h2>
              <p className="text-zinc-500">Select a plan to activate your satellite link.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {PLANS.map((plan) => (
              <motion.div
                key={plan.id}
                whileHover={{ y: -4 }}
                className={cn(
                  "p-6 rounded-3xl border transition-all cursor-pointer group",
                  plan.type === 'special' 
                    ? "bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/40" 
                    : "bg-zinc-900/40 border-white/5 hover:border-white/20"
                )}
                onClick={() => {
                  if (!user) {
                    handleLogin();
                  } else {
                    setShowPaymentAlert(plan);
                  }
                }}
              >
                <div className="flex justify-between items-start mb-6">
                  <div className={cn(
                    "p-3 rounded-2xl",
                    plan.type === 'special' ? "bg-emerald-500 text-black" : "bg-white/5 text-zinc-400"
                  )}>
                    {plan.icon}
                  </div>
                </div>

                <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
                
                <div className="flex items-baseline gap-1">
                  {plan.isFlexible ? (
                    <span className="text-2xl font-bold text-emerald-500">Flexible Fee</span>
                  ) : (
                    <>
                      <span className="text-3xl font-bold">{plan.price.toLocaleString()}</span>
                      <span className="text-zinc-500 text-sm font-mono">UGX</span>
                    </>
                  )}
                </div>
                <p className="text-zinc-500 text-xs mt-4">{plan.description}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Info Section */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-8 py-12 border-t border-white/5">
          <div>
            <h3 className="text-xl font-bold mb-4">Cambium Router Setup</h3>
            <p className="text-zinc-400 leading-relaxed">
              Our system is optimized for Cambium routers connected via Data Empire Satellite. 
              Once you subscribe, your MAC address is automatically whitelisted on our 
              gateway for the duration of your plan.
            </p>
          </div>
          <div className="bg-zinc-900/30 p-6 rounded-2xl border border-white/5">
            <h4 className="font-bold mb-2 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Unlimited Access
            </h4>
            <p className="text-sm text-zinc-500">
              Enjoy unlimited data usage with no throttling. Completely free for all registered users.
            </p>
          </div>
        </section>
      </>
    )}
  </main>

      {/* Payment Modal */}
      <AnimatePresence>
        {showPaymentAlert && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={resetPaymentFlow}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-zinc-900 border border-white/10 p-8 rounded-3xl max-w-md w-full shadow-2xl overflow-hidden"
            >
              {paymentStep === 'input' && (
                <>
                  <div className="flex items-center gap-4 mb-6">
                    <div className="bg-emerald-500/20 p-3 rounded-2xl">
                      <CreditCard className="w-6 h-6 text-emerald-500" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold">Activate Plan</h3>
                      <p className="text-zinc-500 text-sm">{showPaymentAlert.name}</p>
                    </div>
                  </div>

                  <div className="space-y-4 mb-6">
                    {showPaymentAlert.isFlexible && (
                      <div>
                        <label className="block text-xs font-mono uppercase text-zinc-500 mb-2">Contribution Amount (UGX)</label>
                        <input 
                          type="number"
                          placeholder="Enter amount"
                          value={customAmount}
                          onChange={(e) => setCustomAmount(e.target.value)}
                          className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 focus:border-emerald-500 outline-none transition-colors"
                        />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-mono uppercase text-zinc-500 mb-2">MoMo Number</label>
                      <input 
                        type="tel"
                        placeholder="07XX XXX XXX"
                        value={momoNumber}
                        onChange={(e) => setMomoNumber(e.target.value)}
                        className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 focus:border-emerald-500 outline-none transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-mono uppercase text-zinc-500 mb-2">Device MAC Address</label>
                      <input 
                        type="text"
                        placeholder="AA:BB:CC:DD:EE:FF"
                        value={macAddress}
                        onChange={(e) => setMacAddress(e.target.value.toUpperCase())}
                        className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 focus:border-emerald-500 outline-none transition-colors font-mono"
                      />
                    </div>
                  </div>

                  {paymentError && (
                    <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-xl mb-6 flex gap-2 items-center text-red-500 text-xs">
                      <AlertCircle className="w-4 h-4" />
                      {paymentError}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <button 
                      onClick={resetPaymentFlow}
                      className="px-6 py-4 rounded-2xl bg-white/5 hover:bg-white/10 font-bold transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleInitiatePayment}
                      className="px-6 py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold transition-colors"
                    >
                      {showPaymentAlert.isFlexible ? "Trigger Activation" : "Continue"}
                    </button>
                  </div>
                </>
              )}

              {paymentStep === 'processing' && (
                <div className="py-12 flex flex-col items-center text-center">
                  <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-6"></div>
                  <h3 className="text-xl font-bold mb-2">Processing</h3>
                  <p className="text-zinc-500 text-sm">Verifying payment status...</p>
                </div>
              )}

              {paymentStep === 'success' && (
                <div className="py-8 flex flex-col items-center text-center">
                  <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mb-6">
                    <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                  </div>
                  <h3 className="text-2xl font-bold mb-2">Payment Confirmed</h3>
                  <p className="text-zinc-500 text-sm mb-8">Your satellite link is ready to be activated.</p>
                  
                  <button 
                    onClick={handleConnectToWifi}
                    className="w-full py-5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-lg shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-3 transition-all"
                  >
                    Connect Now <Wifi className="w-6 h-6" />
                  </button>
                </div>
              )}

              {paymentStep === 'connecting' && (
                <div className="py-12 flex flex-col items-center text-center">
                  <div className="relative mb-8">
                    <div className="w-24 h-24 border-4 border-emerald-500/20 rounded-full"></div>
                    <div className="absolute inset-0 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                    <MastIcon className="absolute inset-0 m-auto w-10 h-10 text-emerald-500 animate-pulse" />
                  </div>
                  <h3 className="text-xl font-bold mb-2">Whitelisting Device</h3>
                  <p className="text-zinc-500 text-sm mb-2">MAC: <span className="font-mono text-emerald-500">{macAddress}</span></p>
                  <p className="text-zinc-400 text-xs">Configuring gateway permissions...</p>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Error Toast */}
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[110] bg-red-500 text-white px-6 py-4 rounded-2xl shadow-xl flex items-center gap-3"
          >
            <AlertCircle className="w-5 h-5" />
            <span className="font-medium">{error}</span>
            <button onClick={() => setError(null)} className="ml-4 opacity-70 hover:opacity-100">✕</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
