import React, { useState, useEffect } from 'react';
import {
  Database,
  Download,
  Upload,
  FileSpreadsheet,
  Clock,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Cloud,
  Copy,
  Check,
  ArrowUpCircle,
  ArrowDownCircle,
} from 'lucide-react';
import AdminScreenLayout from '../layout/AdminScreenLayout';
import AdminCard from '../components/AdminCard';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  DOCS_UPDATED_EVENT,
  downloadFullBackup,
  restoreFullBackup,
  getStoredInvoices,
  getStoredReceipts,
  getStoredCustomers,
  getStoredActivityLogs,
  ActivityLogItem,
  exportInvoicesToCsv,
  exportReceiptsToCsv,
  exportCustomersToCsv,
  syncDocumentsFromSupabase,
  pushAllDocumentsToSupabase,
} from '@/lib/documentStorage';
import {
  syncContentFromSupabase,
  pushAllContentToSupabase,
} from '@/lib/contentStorage';
import {
  SUPABASE_SCHEMA_SQL,
  checkSupabaseHealth,
  type SupabaseHealthStatus,
} from '@/lib/supabase';
import { useAdminToast } from '../context/AdminToastContext';
import { MAX_BACKUP_BYTES, safeJsonParse } from '@/lib/security';

export default function AdminBackupExport() {
  const toast = useAdminToast();

  const [invoicesCount, setInvoicesCount] = useState(0);
  const [receiptsCount, setReceiptsCount] = useState(0);
  const [customersCount, setCustomersCount] = useState(0);
  const [logs, setLogs] = useState<ActivityLogItem[]>([]);

  // Restore file state
  const [restoreJsonContent, setRestoreJsonContent] = useState<string | null>(null);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [restoreDetails, setRestoreDetails] = useState<{ invoices: number; receipts: number; customers: number } | null>(null);

  // Supabase health & sync state
  const [sbHealth, setSbHealth] = useState<SupabaseHealthStatus | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [syncingAction, setSyncingAction] = useState<'push' | 'pull' | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);

  const loadData = () => {
    setInvoicesCount(getStoredInvoices().length);
    setReceiptsCount(getStoredReceipts().length);
    setCustomersCount(getStoredCustomers().length);
    setLogs(getStoredActivityLogs());
  };

  const refreshSupabaseHealth = async () => {
    setCheckingHealth(true);
    try {
      const status = await checkSupabaseHealth();
      setSbHealth(status);
    } finally {
      setCheckingHealth(false);
    }
  };

  useEffect(() => {
    loadData();
    void syncDocumentsFromSupabase();
    void refreshSupabaseHealth();
    window.addEventListener(DOCS_UPDATED_EVENT, loadData);
    return () => window.removeEventListener(DOCS_UPDATED_EVENT, loadData);
  }, []);

  const handleCopySchemaSql = async () => {
    try {
      await navigator.clipboard.writeText(SUPABASE_SCHEMA_SQL);
      setCopiedSql(true);
      toast.success('Copied Supabase SQL setup script to clipboard.');
      setTimeout(() => setCopiedSql(false), 2500);
    } catch {
      toast.error('Unable to copy automatically. Please copy supabase/schema.sql directly.');
    }
  };

  const handlePushAllToSupabase = async () => {
    setSyncingAction('push');
    try {
      const [contentRes, docsRes] = await Promise.all([
        pushAllContentToSupabase(),
        pushAllDocumentsToSupabase(),
      ]);

      if (!contentRes.success && contentRes.error) {
        toast.error(contentRes.error);
        return;
      }
      if (!docsRes.success && docsRes.error) {
        toast.error(docsRes.error);
        return;
      }

      toast.success(
        `Synced ${contentRes.count} content keys, ${docsRes.counts?.invoices ?? 0} invoices, ${docsRes.counts?.receipts ?? 0} receipts, and ${docsRes.counts?.customers ?? 0} customers to Supabase.`
      );
      await refreshSupabaseHealth();
    } finally {
      setSyncingAction(null);
    }
  };

  const handlePullFromSupabase = async () => {
    setSyncingAction('pull');
    try {
      const [contentOk, docsOk] = await Promise.all([
        syncContentFromSupabase(),
        syncDocumentsFromSupabase(),
      ]);
      loadData();
      if (contentOk || docsOk) {
        toast.success('Pulled latest cloud records from Supabase.');
      } else {
        toast.info('No cloud records pulled yet. Ensure tables exist and you are signed into Supabase.');
      }
      await refreshSupabaseHealth();
    } finally {
      setSyncingAction(null);
    }
  };

  // Handle Restore file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.json')) {
      toast.error('Invalid file type. Please select a .json backup file.');
      e.target.value = '';
      return;
    }
    if (file.size > MAX_BACKUP_BYTES) {
      toast.error('Backup file exceeds the 5 MB maximum allowed size.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const parsed = safeJsonParse<Record<string, unknown>>(text, MAX_BACKUP_BYTES);
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        !Array.isArray(parsed.invoices) ||
        !Array.isArray(parsed.receipts) ||
        !Array.isArray(parsed.customers)
      ) {
        toast.error('Invalid backup file: Missing or malformed invoices, receipts, or customers.');
        return;
      }

      setRestoreDetails({
        invoices: parsed.invoices.length,
        receipts: parsed.receipts.length,
        customers: parsed.customers.length,
      });
      setRestoreJsonContent(text);
      setRestoreConfirmOpen(true);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Confirm Restore
  const handleConfirmRestore = () => {
    if (!restoreJsonContent) return;
    const res = restoreFullBackup(restoreJsonContent);
    if (res.success) {
      toast.success(res.message);
      setRestoreConfirmOpen(false);
      setRestoreJsonContent(null);
      loadData();
    } else {
      toast.error(res.message);
    }
  };

  return (
    <AdminScreenLayout
      title="Data Backup, Export & Audit Log"
      subtitle="Export corporate spreadsheet data (CSV), backup complete financial records (JSON), restore archived databases, and review activity logs."
      previewTitle="Data Integrity"
      preview={
        <div className="p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <span className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
              Total Managed Records
            </span>
            <span className="text-[11px] font-semibold text-[#015557] bg-emerald-50 px-2 py-0.5 rounded">
              Verified
            </span>
          </div>

          <div className="space-y-2 text-xs font-mono">
            <div className="flex justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-slate-600 font-sans">Pro Forma Invoices:</span>
              <span className="font-bold text-slate-900">{invoicesCount}</span>
            </div>
            <div className="flex justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-slate-600 font-sans">Official Receipts:</span>
              <span className="font-bold text-slate-900">{receiptsCount}</span>
            </div>
            <div className="flex justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-slate-600 font-sans">Customer Profiles:</span>
              <span className="font-bold text-slate-900">{customersCount}</span>
            </div>
          </div>

          {/* Supabase Cloud Sync Notice */}
          <div
            className={`p-3 rounded-xl text-xs space-y-1.5 border ${
              sbHealth?.allTablesReady && sbHealth?.authenticated
                ? 'bg-emerald-50/80 border-emerald-200'
                : 'bg-amber-50/80 border-amber-200'
            }`}
          >
            <span
              className={`font-bold flex items-center gap-1.5 ${
                sbHealth?.allTablesReady && sbHealth?.authenticated
                  ? 'text-[#015557]'
                  : 'text-amber-900'
              }`}
            >
              {sbHealth?.allTablesReady && sbHealth?.authenticated ? (
                <CheckCircle2 className="w-4 h-4 text-[#015557]" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-600" />
              )}
              <span>
                {sbHealth?.allTablesReady && sbHealth?.authenticated
                  ? 'Supabase Cloud Sync Active'
                  : 'Cloud Setup & Sync Notice'}
              </span>
            </span>
            <p
              className={`leading-relaxed text-[11px] ${
                sbHealth?.allTablesReady && sbHealth?.authenticated
                  ? 'text-emerald-800'
                  : 'text-amber-800'
              }`}
            >
              {sbHealth?.allTablesReady && sbHealth?.authenticated
                ? `Connected to ${sbHealth.projectId || 'Supabase'}. Edits automatically mirror to PostgreSQL while retaining offline JSON backups.`
                : 'Run the SQL setup script in your Supabase SQL Editor and sign in with a Supabase Admin account to persist records across devices.'}
            </p>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Supabase Cloud Backend & Database Setup */}
        <AdminCard
          title="Supabase Cloud Backend & Database Setup"
          subtitle="Live PostgreSQL connection health, schema table verification, and two-way synchronization."
          action={
            <button
              type="button"
              onClick={refreshSupabaseHealth}
              disabled={checkingHealth}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${checkingHealth ? 'animate-spin' : ''}`} />
              <span>{checkingHealth ? 'Checking...' : 'Check Status'}</span>
            </button>
          }
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] font-semibold text-slate-500 uppercase block">
                  Project Reference
                </span>
                <span className="font-mono font-bold text-slate-900 flex items-center gap-1.5 mt-1">
                  <Cloud className="w-3.5 h-3.5 text-[#015557]" />
                  {sbHealth?.projectId || 'Not configured'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] font-semibold text-slate-500 uppercase block">
                  Cloud Auth Session
                </span>
                <span
                  className={`font-semibold mt-1 block truncate ${
                    sbHealth?.authenticated ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                >
                  {sbHealth?.authenticated
                    ? `Signed in (${sbHealth.userEmail || 'Supabase'})`
                    : 'Not signed in'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] font-semibold text-slate-500 uppercase block">
                  Database Tables
                </span>
                <span
                  className={`font-semibold mt-1 block ${
                    sbHealth?.allTablesReady ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                >
                  {sbHealth
                    ? `${sbHealth.tables.filter((t) => t.exists).length} / ${sbHealth.tables.length} Ready`
                    : 'Checking...'}
                </span>
              </div>
            </div>

            {/* Table Status Grid */}
            {sbHealth && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
                {sbHealth.tables.map((t) => (
                  <div
                    key={t.table}
                    className={`px-2.5 py-2 rounded-lg border flex items-center justify-between gap-2 font-mono ${
                      t.exists
                        ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900'
                        : 'bg-amber-50/60 border-amber-200 text-amber-900'
                    }`}
                    title={t.error || 'Table ready'}
                  >
                    <span className="truncate">{t.table}</span>
                    {t.exists ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            )}

            {sbHealth && !sbHealth.allTablesReady && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1.5">
                <p className="font-bold flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>One-Time Schema Setup Required</span>
                </p>
                <p className="text-[11px] leading-relaxed">
                  Click <strong>Copy SQL Setup Script</strong> below, open your Supabase project&apos;s{' '}
                  <strong>SQL Editor</strong>, paste and run the script once to create all 9 tables and security policies.
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleCopySchemaSql}
                className="min-h-[42px] px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-2"
              >
                {copiedSql ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{copiedSql ? 'SQL Script Copied!' : 'Copy SQL Setup Script'}</span>
              </button>

              <button
                type="button"
                onClick={handlePushAllToSupabase}
                disabled={syncingAction !== null}
                className="min-h-[42px] px-4 py-2 bg-[#015557] hover:bg-[#014345] text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-2 disabled:opacity-60"
              >
                <ArrowUpCircle className="w-4 h-4" />
                <span>
                  {syncingAction === 'push' ? 'Syncing to Cloud...' : 'Sync Local Data to Supabase'}
                </span>
              </button>

              <button
                type="button"
                onClick={handlePullFromSupabase}
                disabled={syncingAction !== null}
                className="min-h-[42px] px-4 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 text-xs font-semibold rounded-xl transition-colors flex items-center gap-2 disabled:opacity-60"
              >
                <ArrowDownCircle className="w-4 h-4 text-[#015557]" />
                <span>
                  {syncingAction === 'pull' ? 'Pulling from Cloud...' : 'Pull Latest from Supabase'}
                </span>
              </button>
            </div>
          </div>
        </AdminCard>

        {/* Full JSON Backup & Restore Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* JSON Export */}
          <AdminCard
            title="Full System Backup (JSON)"
            subtitle="Download an encrypted JSON file with all invoices, receipts, customer records, and settings."
          >
            <div className="space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Creates an instantaneous complete snapshot of Santa Towing billing and customer records. Keep this file in a safe location or cloud drive for disaster recovery.
              </p>

              <button
                type="button"
                onClick={downloadFullBackup}
                className="w-full py-3 bg-[#015557] hover:bg-[#014345] text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>Download Complete JSON Backup</span>
              </button>
            </div>
          </AdminCard>

          {/* JSON Restore */}
          <AdminCard
            title="Restore from JSON Backup"
            subtitle="Import previously archived JSON backup file with structural verification."
          >
            <div className="space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Upload a verified Santa Towing JSON backup file. All entries will be validated before restoring into your database.
              </p>

              <label className="w-full py-3 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer">
                <Upload className="w-4 h-4 text-slate-600" />
                <span>Select Backup File to Restore</span>
                <input
                  type="file"
                  accept="application/json"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>
            </div>
          </AdminCard>
        </div>

        {/* Spreadsheets (CSV) Exports */}
        <AdminCard
          title="Spreadsheet Exports (CSV)"
          subtitle="Download clean CSV spreadsheets compatible with Microsoft Excel, Google Sheets, or accounting software."
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-1">
            <button
              type="button"
              onClick={exportInvoicesToCsv}
              className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-white hover:border-[#015557] hover:shadow-xs transition-all text-left flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center gap-2 text-emerald-700 mb-2">
                  <FileSpreadsheet className="w-5 h-5" />
                  <span className="font-bold text-xs uppercase tracking-wider">Invoices CSV</span>
                </div>
                <h4 className="text-sm font-bold text-slate-900">Pro Forma Invoices</h4>
                <p className="text-xs text-slate-500 mt-1">
                  Itemized towing services, tax rates, subtotals &amp; payment statuses.
                </p>
              </div>
              <div className="mt-4 pt-2 border-t border-slate-100 text-xs text-[#015557] font-semibold flex items-center gap-1">
                <Download className="w-3.5 h-3.5" />
                <span>Export ({invoicesCount} items)</span>
              </div>
            </button>

            <button
              type="button"
              onClick={exportReceiptsToCsv}
              className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-white hover:border-[#015557] hover:shadow-xs transition-all text-left flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center gap-2 text-emerald-700 mb-2">
                  <FileSpreadsheet className="w-5 h-5" />
                  <span className="font-bold text-xs uppercase tracking-wider">Receipts CSV</span>
                </div>
                <h4 className="text-sm font-bold text-slate-900">Official Receipts</h4>
                <p className="text-xs text-slate-500 mt-1">
                  Payment methods, MoMo references, bank slips &amp; settlements.
                </p>
              </div>
              <div className="mt-4 pt-2 border-t border-slate-100 text-xs text-[#015557] font-semibold flex items-center gap-1">
                <Download className="w-3.5 h-3.5" />
                <span>Export ({receiptsCount} items)</span>
              </div>
            </button>

            <button
              type="button"
              onClick={exportCustomersToCsv}
              className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-white hover:border-[#015557] hover:shadow-xs transition-all text-left flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center gap-2 text-emerald-700 mb-2">
                  <FileSpreadsheet className="w-5 h-5" />
                  <span className="font-bold text-xs uppercase tracking-wider">Customers CSV</span>
                </div>
                <h4 className="text-sm font-bold text-slate-900">Customer Directory</h4>
                <p className="text-xs text-slate-500 mt-1">
                  Corporate contacts, telephone numbers, emails &amp; addresses.
                </p>
              </div>
              <div className="mt-4 pt-2 border-t border-slate-100 text-xs text-[#015557] font-semibold flex items-center gap-1">
                <Download className="w-3.5 h-3.5" />
                <span>Export ({customersCount} items)</span>
              </div>
            </button>
          </div>
        </AdminCard>

        {/* Activity & Audit Trail History */}
        <AdminCard
          title="System Audit & Activity Log"
          subtitle="Chronological record of document generation, edits, status updates, and data exports."
        >
          {logs.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-4">No recent activity recorded.</p>
          ) : (
            <div className="divide-y divide-slate-100 text-xs">
              {logs.slice(0, 15).map((log) => (
                <div key={log.id} className="py-3 flex items-start justify-between gap-4">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{log.entityTitle}</span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600 uppercase">
                        {log.action}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        ({log.entityType})
                      </span>
                    </div>
                    <p className="text-slate-600">{log.details}</p>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400">
                      <span>User: {log.user}</span>
                      <span>&bull;</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </AdminCard>
      </div>

      {/* Confirm Restore Dialog */}
      <ConfirmDialog
        isOpen={restoreConfirmOpen}
        title="Confirm Database Restore?"
        description={`This will overwrite current document records with the backup file containing ${restoreDetails?.invoices} Invoices, ${restoreDetails?.receipts} Receipts, and ${restoreDetails?.customers} Customers. Are you sure you wish to proceed?`}
        confirmLabel="Restore Data"
        cancelLabel="Cancel"
        isDestructive={true}
        onConfirm={handleConfirmRestore}
        onCancel={() => {
          setRestoreConfirmOpen(false);
          setRestoreJsonContent(null);
        }}
      />
    </AdminScreenLayout>
  );
}
