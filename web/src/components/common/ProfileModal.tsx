import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { ArgosHoundLogo } from './ArgosHoundLogo';
import { sendTestEmail, triggerDigest } from '../../services/notes';
import {
  X,
  LogOut,
  Globe,
  Mail,
  Clock,
  ShieldCheck,
  Download,
  Save,
  Send,
  Sparkles,
  Check,
  AlertCircle,
  Loader2,
  RefreshCw,
} from 'lucide-react';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  isInstallable?: boolean;
  onInstall?: () => void;
  onDigestTriggered?: () => void;
}

const COMMON_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'America/Honolulu',
  'America/Toronto',
  'America/Vancouver',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Rome',
  'Europe/Madrid',
  'Europe/Amsterdam',
  'Europe/Athens',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Pacific/Auckland',
  'UTC',
];

export function ProfileModal(props: ProfileModalProps) {
  if (!props.isOpen) return null;
  return <ProfileModalContent {...props} />;
}

function ProfileModalContent({
  onClose,
  isInstallable,
  onInstall,
  onDigestTriggered,
}: ProfileModalProps) {
  const { user, userProfile, updateProfileConfig, signOut } = useAuth();

  const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const initialTz = userProfile?.timezone || detectedTz;
  const initialHour = userProfile?.digestHour ?? 6;
  const initialEmailEnabled = userProfile?.emailNotificationsEnabled ?? true;

  const [timezone, setTimezone] = useState(initialTz);
  const [digestHour, setDigestHour] = useState(initialHour);
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState(initialEmailEnabled);

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [testEmailLoading, setTestEmailLoading] = useState(false);
  const [testEmailStatus, setTestEmailStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const [triggerLoading, setTriggerLoading] = useState(false);
  const [triggerStatus, setTriggerStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const hasUnsavedChanges =
    timezone !== (userProfile?.timezone || detectedTz) ||
    digestHour !== (userProfile?.digestHour ?? 6) ||
    emailNotificationsEnabled !== (userProfile?.emailNotificationsEnabled ?? true);

  const handleSavePreferences = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      await updateProfileConfig({
        timezone,
        digestHour,
        emailNotificationsEnabled,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      console.error('Failed to save settings:', err);
      setSaveError(err?.message || 'Failed to update preferences.');
    } finally {
      setSaving(false);
    }
  };

  const handleSendTestEmail = async () => {
    setTestEmailLoading(true);
    setTestEmailStatus(null);

    try {
      const result = await sendTestEmail({
        recipientEmail: user?.email || undefined,
      });
      setTestEmailStatus({
        type: 'success',
        message: `Test email successfully sent to ${result.recipient}! Check your inbox.`,
      });
    } catch (err: any) {
      console.error('Test email failed:', err);
      setTestEmailStatus({
        type: 'error',
        message:
          err?.message ||
          'Failed to send test email. Ensure RESEND_API_KEY is configured in backend environment.',
      });
    } finally {
      setTestEmailLoading(false);
    }
  };

  const handleTriggerDigestNow = async () => {
    setTriggerLoading(true);
    setTriggerStatus(null);

    try {
      const result = await triggerDigest({
        force: true,
        sendEmail: emailNotificationsEnabled,
      });

      if (result.skipped && result.reason === 'zero-activity') {
        setTriggerStatus({
          type: 'success',
          message: `Zero-Activity Gate: 0 notes found for yesterday (${result.date}). No digest synthesized.`,
        });
      } else {
        const emailMsg = result.emailMessageId
          ? ' Email delivered!'
          : emailNotificationsEnabled
            ? ' (No email delivered)'
            : ' (Email skipped per settings)';
        setTriggerStatus({
          type: 'success',
          message: `Digest generated for ${result.date} with ${result.noteCount} note${
            result.noteCount === 1 ? '' : 's'
          }.${emailMsg}`,
        });
      }

      onDigestTriggered?.();
    } catch (err: any) {
      console.error('Manual digest trigger failed:', err);
      setTriggerStatus({
        type: 'error',
        message: err?.message || 'Failed to generate digest.',
      });
    } finally {
      setTriggerLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      onClose();
    } catch (err) {
      console.error('Failed to sign out:', err);
    }
  };

  const formatHourLabel = (hour: number) => {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;
    return `${displayHour}:00 ${period}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            <ArgosHoundLogo className="h-7 w-7" />
            <div>
              <h2 className="text-sm font-bold text-white">Settings & Preferences</h2>
              <p className="text-[11px] text-slate-400">Configure your personal daily briefings</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {/* User Account info */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                <Mail className="h-4 w-4" />
              </div>
              <div>
                <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  Account Email
                </span>
                <span className="font-mono text-slate-200 text-xs">{user?.email}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-400">
              <ShieldCheck className="h-3 w-3" />
              <span>Active</span>
            </div>
          </div>

          {/* Timezone Preference */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="argos-timezone-select" className="flex items-center gap-1.5 font-semibold text-slate-200">
                <Globe className="h-3.5 w-3.5 text-amber-400" />
                <span>Primary Timezone</span>
              </label>
              <button
                type="button"
                onClick={() => setTimezone(detectedTz)}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 underline underline-offset-2 flex items-center gap-1"
                title="Detect timezone from browser"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Auto-detect ({detectedTz})</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              Used to calculate "yesterday's" boundary and schedule your morning digest dispatch.
            </p>
            <div className="relative">
              <select
                id="argos-timezone-select"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full appearance-none rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
              >
                {!COMMON_TIMEZONES.includes(timezone) && (
                  <option value={timezone}>{timezone} (Current)</option>
                )}
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Daily Schedule Hour */}
          <div className="space-y-2">
            <label htmlFor="argos-digest-hour-select" className="flex items-center gap-1.5 font-semibold text-slate-200">
              <Clock className="h-3.5 w-3.5 text-emerald-400" />
              <span>Digest Delivery Schedule</span>
            </label>
            <p className="text-[11px] text-slate-400">
              Select the preferred local hour for your automated Daily Digest compilation.
            </p>
            <select
              id="argos-digest-hour-select"
              value={digestHour}
              onChange={(e) => setDigestHour(Number(e.target.value))}
              className="w-full appearance-none rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
            >
              {Array.from({ length: 24 }).map((_, h) => (
                <option key={h} value={h}>
                  {formatHourLabel(h)} ({h.toString().padStart(2, '0')}:00)
                </option>
              ))}
            </select>
          </div>

          {/* Email Notification Toggle */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="font-semibold text-white">Daily Digest Email Delivery</span>
                <p className="text-[11px] text-slate-400">
                  Send HTML summary to <span className="font-mono text-slate-300">{user?.email}</span>
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={emailNotificationsEnabled}
                onClick={() => setEmailNotificationsEnabled(!emailNotificationsEnabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  emailNotificationsEnabled ? 'bg-indigo-600' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    emailNotificationsEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed border-t border-slate-800/60 pt-2">
              If toggled off, digests will still be synthesized and archived in the Digests tab, but no emails will be sent.
            </p>
          </div>

          {/* Test Email Button & Status */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold text-white">Test Email Delivery</span>
                <p className="text-[11px] text-slate-400">
                  Verify that your Resend connection and mailbox receive emails.
                </p>
              </div>
              <button
                type="button"
                disabled={testEmailLoading}
                onClick={handleSendTestEmail}
                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 font-medium text-indigo-300 hover:bg-indigo-500/20 transition-colors disabled:opacity-50"
              >
                {testEmailLoading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" />
                    <span>Send Test Email</span>
                  </>
                )}
              </button>
            </div>

            {testEmailStatus && (
              <div
                className={`flex items-start gap-2 rounded-lg p-2.5 text-[11px] border ${
                  testEmailStatus.type === 'success'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                }`}
              >
                {testEmailStatus.type === 'success' ? (
                  <Check className="h-4 w-4 shrink-0 mt-0.5 text-emerald-400" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />
                )}
                <span>{testEmailStatus.message}</span>
              </div>
            )}
          </div>

          {/* Manual Trigger Section */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold text-white">Manual Digest Generation</span>
                <p className="text-[11px] text-slate-400">
                  Synthesize yesterday's notes right now for immediate testing.
                </p>
              </div>
              <button
                type="button"
                disabled={triggerLoading}
                onClick={handleTriggerDigestNow}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 font-medium text-amber-300 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
              >
                {triggerLoading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Synthesizing...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Trigger Now</span>
                  </>
                )}
              </button>
            </div>

            {triggerStatus && (
              <div
                className={`flex items-start gap-2 rounded-lg p-2.5 text-[11px] border ${
                  triggerStatus.type === 'success'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                }`}
              >
                {triggerStatus.type === 'success' ? (
                  <Check className="h-4 w-4 shrink-0 mt-0.5 text-emerald-400" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />
                )}
                <span>{triggerStatus.message}</span>
              </div>
            )}
          </div>

          {/* Feedback & Error display */}
          {saveError && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{saveError}</span>
            </div>
          )}

          {/* Save Action Banner */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
            <span className="text-[11px] text-slate-400">
              {saveSuccess ? (
                <span className="text-emerald-400 flex items-center gap-1">
                  <Check className="h-3.5 w-3.5" />
                  Preferences updated successfully
                </span>
              ) : hasUnsavedChanges ? (
                <span className="text-amber-400">You have unsaved changes</span>
              ) : (
                'Settings up to date'
              )}
            </span>
            <button
              type="button"
              disabled={saving || !hasUnsavedChanges}
              onClick={() => handleSavePreferences()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 font-medium text-white shadow-lg hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5" />
                  <span>Save Settings</span>
                </>
              )}
            </button>
          </div>

          {/* Install PWA Prompt if supported */}
          {isInstallable && onInstall && (
            <button
              type="button"
              onClick={() => {
                onInstall();
                onClose();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 py-2.5 font-medium text-indigo-300 hover:bg-indigo-500/20 transition-colors"
            >
              <Download className="h-4 w-4" />
              <span>Install Argos PWA to Home Screen</span>
            </button>
          )}

          {/* Sign Out Button */}
          <button
            type="button"
            onClick={handleSignOut}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 py-2.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
}
