import React, { useState, useEffect, useMemo } from 'react';
import {
  Inbox,
  Truck,
  PackageCheck,
  Car,
  Calendar,
  Briefcase,
  MessageSquare,
  Mail,
  Phone,
  RefreshCw,
  Trash2,
  CheckCircle2,
  Clock,
  Archive,
  AlertCircle,
  Search,
} from 'lucide-react';
import AdminScreenLayout from '../layout/AdminScreenLayout';
import AdminCard from '../components/AdminCard';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import {
  ServiceRequestRecord,
  ServiceRequestStatus,
  ServiceRequestType,
  NewsletterSubscriber,
  getServiceRequests,
  updateServiceRequestStatus,
  deleteServiceRequest,
  getNewsletterSubscribers,
  deleteNewsletterSubscriber,
} from '@/lib/supabaseRequests';
import { isSupabaseConfigured } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { useAdminToast } from '../context/AdminToastContext';

const TYPE_META: Record<
  ServiceRequestType,
  { label: string; icon: React.ComponentType<{ className?: string }>; badgeClass: string }
> = {
  towing: {
    label: 'Emergency Towing',
    icon: Truck,
    badgeClass: 'bg-red-50 text-[#d80000] border-red-200',
  },
  haulage: {
    label: 'Haulage Quote',
    icon: PackageCheck,
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  rental: {
    label: 'Rental Booking',
    icon: Calendar,
    badgeClass: 'bg-blue-50 text-blue-800 border-blue-200',
  },
  car_viewing: {
    label: 'Car Viewing',
    icon: Car,
    badgeClass: 'bg-emerald-50 text-[#015557] border-emerald-200',
  },
  part_review: {
    label: 'Part Review',
    icon: MessageSquare,
    badgeClass: 'bg-purple-50 text-purple-800 border-purple-200',
  },
  career_application: {
    label: 'Job Application',
    icon: Briefcase,
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-300',
  },
};

const STATUS_TABS: ('all' | ServiceRequestStatus)[] = [
  'all',
  'new',
  'in_progress',
  'completed',
  'archived',
];

export default function AdminRequests() {
  const toast = useAdminToast();
  const currentUser = getCurrentUser();
  const [activeView, setActiveView] = useState<'requests' | 'subscribers'>('requests');
  const [requests, setRequests] = useState<ServiceRequestRecord[]>([]);
  const [subscribers, setSubscribers] = useState<NewsletterSubscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<'all' | ServiceRequestStatus>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | ServiceRequestType>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<{
    kind: 'request' | 'subscriber';
    id: string;
    label: string;
  } | null>(null);

  const loadAll = async () => {
    setLoading(true);
    setLoadError(null);
    const [reqRes, subRes] = await Promise.all([
      getServiceRequests(),
      getNewsletterSubscribers(),
    ]);

    if (reqRes.error) {
      setLoadError(reqRes.error);
    }
    setRequests(reqRes.data);
    setSubscribers(subRes.data);
    setLoading(false);
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const filteredRequests = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return requests.filter((r) => {
      const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
      const matchesType = typeFilter === 'all' || r.request_type === typeFilter;
      const matchesSearch =
        !q ||
        r.customer_name.toLowerCase().includes(q) ||
        (r.phone && r.phone.toLowerCase().includes(q)) ||
        (r.email && r.email.toLowerCase().includes(q)) ||
        (r.subject && r.subject.toLowerCase().includes(q));
      return matchesStatus && matchesType && matchesSearch;
    });
  }, [requests, statusFilter, typeFilter, searchQuery]);

  const filteredSubscribers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return subscribers;
    return subscribers.filter(
      (s) => s.email.toLowerCase().includes(q) || s.source.toLowerCase().includes(q)
    );
  }, [subscribers, searchQuery]);

  const handleStatusChange = async (id: string, nextStatus: ServiceRequestStatus) => {
    const res = await updateServiceRequestStatus(id, nextStatus);
    if (res.success) {
      setRequests((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: nextStatus } : r))
      );
      toast.success(`Request status updated to ${nextStatus.replace('_', ' ')}.`);
    } else {
      toast.error(res.error || 'Failed to update status.');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.kind === 'request') {
      const res = await deleteServiceRequest(deleteTarget.id);
      if (res.success) {
        setRequests((prev) => prev.filter((r) => r.id !== deleteTarget.id));
        toast.success('Service request deleted.');
      } else {
        toast.error(res.error || 'Failed to delete request.');
      }
    } else {
      const res = await deleteNewsletterSubscriber(deleteTarget.id);
      if (res.success) {
        setSubscribers((prev) => prev.filter((s) => s.id !== deleteTarget.id));
        toast.success('Subscriber removed.');
      } else {
        toast.error(res.error || 'Failed to remove subscriber.');
      }
    }
    setDeleteTarget(null);
  };

  const newCount = requests.filter((r) => r.status === 'new').length;

  return (
    <AdminScreenLayout
      title="Service Requests & Leads"
      subtitle="Live customer dispatch requests, haulage quotes, rental reservations, car viewings, job applications, and newsletter subscribers stored in Supabase."
      previewTitle="Queue Summary"
      preview={
        <div className="p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <span className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
              Inbound Pipeline
            </span>
            <span className="text-[11px] font-bold text-[#015557] bg-emerald-50 px-2 py-0.5 rounded">
              Supabase Live
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between p-2.5 bg-red-50/70 rounded-lg border border-red-100">
              <span className="text-red-900 font-medium">New Requests:</span>
              <span className="font-bold font-mono text-[#d80000]">{newCount}</span>
            </div>
            <div className="flex justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-slate-600">Total Requests:</span>
              <span className="font-bold font-mono text-slate-900">{requests.length}</span>
            </div>
            <div className="flex justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-slate-600">Newsletter Subscribers:</span>
              <span className="font-bold font-mono text-slate-900">{subscribers.length}</span>
            </div>
          </div>

          {!currentUser?.email && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 leading-relaxed">
              Sign in with your Supabase Auth account to read and manage protected customer submissions.
            </div>
          )}
        </div>
      }
    >
      <div className="space-y-5">
        {/* View Switcher & Refresh */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
            <button
              type="button"
              onClick={() => setActiveView('requests')}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                activeView === 'requests'
                  ? 'bg-white text-[#015557] shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Service Requests ({requests.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveView('subscribers')}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                activeView === 'subscribers'
                  ? 'bg-white text-[#015557] shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Newsletter ({subscribers.length})
            </button>
          </div>

          <button
            type="button"
            onClick={() => void loadAll()}
            disabled={loading}
            className="min-h-[40px] px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Auth / Schema Guidance Notice */}
        {(!isSupabaseConfigured() || loadError) && (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold">Supabase Connection Notice</p>
              <p>
                {loadError ||
                  'Run the SQL setup script in Data Backup & Export and sign in with a Supabase account to view customer submissions.'}
              </p>
            </div>
          </div>
        )}

        {/* Search & Filters */}
        <AdminCard>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by customer name, phone, email, or subject..."
                className="w-full min-h-[42px] pl-10 pr-4 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#015557]"
              />
            </div>

            {activeView === 'requests' && (
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as 'all' | ServiceRequestType)}
                className="min-h-[42px] px-3 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl text-slate-700"
              >
                <option value="all">All Request Types</option>
                {Object.entries(TYPE_META).map(([key, meta]) => (
                  <option key={key} value={key}>
                    {meta.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          {activeView === 'requests' && (
            <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-slate-100">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setStatusFilter(tab)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors cursor-pointer ${
                    statusFilter === tab
                      ? 'bg-[#015557] text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tab.replace('_', ' ')}
                </button>
              ))}
            </div>
          )}
        </AdminCard>

        {/* Requests List */}
        {activeView === 'requests' ? (
          filteredRequests.length === 0 ? (
            <AdminCard>
              <EmptyState
                title={loading ? 'Loading customer requests...' : 'No service requests found'}
                description="Customer towing requests, haulage quotes, rental reservations, car viewings, and job applications submitted on the public site appear here."
                actionLabel="Refresh Queue"
                onAction={() => void loadAll()}
              />
            </AdminCard>
          ) : (
            <div className="space-y-3">
              {filteredRequests.map((req) => {
                const meta = TYPE_META[req.request_type] || TYPE_META.towing;
                const Icon = meta.icon;
                return (
                  <AdminCard key={req.id} bodyClassName="p-4 sm:p-5">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      <div className="space-y-2 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${meta.badgeClass}`}
                          >
                            <Icon className="w-3.5 h-3.5" />
                            {meta.label}
                          </span>
                          <span className="text-sm font-bold text-slate-900">
                            {req.customer_name}
                          </span>
                          <span className="text-[11px] text-slate-400 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(req.created_at).toLocaleString()}
                          </span>
                        </div>

                        {req.subject && (
                          <p className="text-xs font-semibold text-slate-800">{req.subject}</p>
                        )}

                        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
                          {req.phone && (
                            <span className="flex items-center gap-1.5">
                              <Phone className="w-3.5 h-3.5 text-[#015557]" />
                              {req.phone}
                            </span>
                          )}
                          {req.email && (
                            <span className="flex items-center gap-1.5">
                              <Mail className="w-3.5 h-3.5 text-[#015557]" />
                              {req.email}
                            </span>
                          )}
                        </div>

                        {req.payload && Object.keys(req.payload).length > 0 && (
                          <div className="mt-2 p-3 rounded-xl bg-slate-50 border border-slate-200/80 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
                            {Object.entries(req.payload).map(([k, v]) => (
                              <div key={k} className="truncate">
                                <span className="font-semibold text-slate-500 capitalize">
                                  {k.replace(/([A-Z])/g, ' $1')}:{' '}
                                </span>
                                <span className="text-slate-800">
                                  {typeof v === 'object' ? JSON.stringify(v) : String(v ?? '—')}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <select
                          value={req.status}
                          onChange={(e) =>
                            void handleStatusChange(req.id, e.target.value as ServiceRequestStatus)
                          }
                          aria-label="Request status"
                          className="min-h-[38px] px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg text-slate-800"
                        >
                          <option value="new">New</option>
                          <option value="in_progress">In Progress</option>
                          <option value="completed">Completed</option>
                          <option value="archived">Archived</option>
                        </select>

                        <button
                          type="button"
                          onClick={() =>
                            setDeleteTarget({
                              kind: 'request',
                              id: req.id,
                              label: req.subject || req.customer_name,
                            })
                          }
                          aria-label="Delete request"
                          className="min-h-[38px] min-w-[38px] p-2 text-slate-400 hover:text-[#d80000] hover:bg-red-50 rounded-lg transition-colors cursor-pointer flex items-center justify-center"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </AdminCard>
                );
              })}
            </div>
          )
        ) : filteredSubscribers.length === 0 ? (
          <AdminCard>
            <EmptyState
              title="No newsletter subscribers yet"
              description="Email addresses submitted via the website footer or blog newsletter forms appear here."
              actionLabel="Refresh List"
              onAction={() => void loadAll()}
            />
          </AdminCard>
        ) : (
          <AdminCard title="Newsletter Subscribers">
            <div className="divide-y divide-slate-100">
              {filteredSubscribers.map((sub) => (
                <div
                  key={sub.id}
                  className="py-3 flex items-center justify-between gap-4 text-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-[#015557] flex items-center justify-center shrink-0">
                      <Mail className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 truncate">{sub.email}</p>
                      <p className="text-[11px] text-slate-400">
                        Source: {sub.source} &bull;{' '}
                        {new Date(sub.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setDeleteTarget({
                        kind: 'subscriber',
                        id: sub.id,
                        label: sub.email,
                      })
                    }
                    className="p-2 text-slate-400 hover:text-[#d80000] hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                    aria-label="Remove subscriber"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </AdminCard>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete Record?"
        description={`Are you sure you want to delete "${deleteTarget?.label}" from Supabase? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        isDestructive={true}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </AdminScreenLayout>
  );
}
