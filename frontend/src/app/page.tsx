"use client";

import { useSession, signIn } from "next-auth/react";
import Header from "../components/Header";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type EmailJob = {
  id: string;
  recipientEmail: string;
  status: string;
  scheduledAt: string;
  sentAt?: string;
  campaign: { subject: string };
};

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'scheduled' | 'sent'>('scheduled');
  const [scheduledJobs, setScheduledJobs] = useState<EmailJob[]>([]);
  const [sentJobs, setSentJobs] = useState<EmailJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (status === "unauthenticated") {
      // Render login UI for unauthenticated users
    } else if (status === "authenticated") {
      fetchJobs();
    }
  }, [status]);

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const [scheduledRes, sentRes] = await Promise.all([
        fetch('http://localhost:5000/api/emails/scheduled'),
        fetch('http://localhost:5000/api/emails/sent')
      ]);
      if (scheduledRes.ok) setScheduledJobs(await scheduledRes.json());
      if (sentRes.ok) setSentJobs(await sentRes.json());
    } catch (error) {
      console.error("Error fetching jobs", error);
    }
    setLoading(false);
  };

  if (status === "loading") {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  if (status === "unauthenticated") {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-gray-50">
        <div className="p-10 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col items-center">
          <h1 className="text-3xl font-bold mb-8">Login</h1>
          <button 
            onClick={() => signIn('google')}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-green-50 text-green-700 font-medium rounded-lg hover:bg-green-100 transition-colors border border-green-200"
          >
            Login with Google
          </button>
          <div className="mt-6 flex items-center gap-4 w-full">
            <div className="h-px bg-gray-200 flex-1"></div>
            <span className="text-xs text-gray-400">or sign up through email</span>
            <div className="h-px bg-gray-200 flex-1"></div>
          </div>
          <div className="w-full mt-6 space-y-4">
            <input type="email" placeholder="Email ID" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500" disabled />
            <input type="password" placeholder="Password" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500" disabled />
            <button className="w-full py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors" disabled>Login</button>
          </div>
        </div>
      </div>
    );
  }

  const renderTable = (jobs: EmailJob[], isSent: boolean) => {
    if (loading) return <div className="p-8 text-center text-gray-500">Loading emails...</div>;
    if (jobs.length === 0) return <div className="p-8 text-center text-gray-500">No {isSent ? 'sent' : 'scheduled'} emails found.</div>;

    return (
      <div className="w-full">
        {jobs.map((job) => (
          <div key={job.id} className="flex items-center justify-between p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors">
            <div className="flex items-center gap-6 flex-1">
              <span className="font-medium text-gray-900 min-w-[200px]">To: {job.recipientEmail}</span>
              <div className="flex items-center gap-2 text-sm text-gray-500 truncate flex-1">
                <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium border border-gray-200 flex-shrink-0">
                  {new Date(isSent ? job.sentAt! : job.scheduledAt).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}
                </span>
                <span className="font-medium text-gray-900">{job.campaign?.subject}</span>
              </div>
            </div>
            <div>
              <span className={`px-2 py-1 rounded text-xs font-bold uppercase tracking-wider ${
                job.status === 'SENT' ? 'bg-green-100 text-green-700' :
                job.status === 'FAILED' ? 'bg-red-100 text-red-700' :
                'bg-blue-100 text-blue-700'
              }`}>
                {job.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 border-r border-gray-200 p-6 flex flex-col gap-6">
          <button 
            onClick={() => router.push('/compose')}
            className="w-full py-2.5 bg-white border border-green-500 text-green-600 font-medium rounded-full hover:bg-green-50 transition-colors"
          >
            Compose
          </button>
          
          <nav className="flex flex-col gap-2 mt-4">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Core</div>
            <button 
              onClick={() => setActiveTab('scheduled')}
              className={`flex items-center justify-between px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'scheduled' ? 'bg-green-50 text-green-700' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              <div className="flex items-center gap-3">
                <span>⏱</span>
                <span>Scheduled</span>
              </div>
              <span className="text-xs opacity-60">{scheduledJobs.length}</span>
            </button>
            <button 
              onClick={() => setActiveTab('sent')}
              className={`flex items-center justify-between px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'sent' ? 'bg-green-50 text-green-700' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              <div className="flex items-center gap-3">
                <span>✓</span>
                <span>Sent</span>
              </div>
              <span className="text-xs opacity-60">{sentJobs.length}</span>
            </button>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto bg-white p-8">
          <div className="max-w-4xl border border-gray-100 rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
              <div className="relative w-full max-w-md">
                <input 
                  type="text" 
                  placeholder="Search emails or subjects..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
                />
                <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
              </div>
            </div>
            {activeTab === 'scheduled' 
              ? renderTable(scheduledJobs.filter(j => j.recipientEmail.toLowerCase().includes(searchQuery.toLowerCase()) || j.campaign?.subject.toLowerCase().includes(searchQuery.toLowerCase())), false) 
              : renderTable(sentJobs.filter(j => j.recipientEmail.toLowerCase().includes(searchQuery.toLowerCase()) || j.campaign?.subject.toLowerCase().includes(searchQuery.toLowerCase())), true)}
          </div>
        </main>
      </div>
    </div>
  );
}
