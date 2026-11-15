import { useState } from 'react';
import type { User } from 'firebase/auth';
import {
  BookmarkPlus,
  ClipboardList,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import type {
  FarmerPriorities,
  FarmParcelProfile,
  NasaPowerSummary,
  RotationSimulationResult,
} from '../lib/agronomy';
import type { SavedFarmRecord } from '../lib/api';
import type {
  DocExportResult,
  FormExportResult,
  FormResponseSummary,
  SheetExportResult,
} from '../lib/workspaceApi';
import { ConfirmDialog } from './ConfirmDialog';

interface WorkspaceHubProps {
  parcel: FarmParcelProfile;
  nasa: NasaPowerSummary;
  simulation: RotationSimulationResult;
  priorities: FarmerPriorities;
  aiBriefMarkdown: string | null;
  user: User | null;
  hasWorkspaceToken: boolean;
  onSignIn: () => void;
  savedFarms: SavedFarmRecord[];
  farmsLoading: boolean;
  onRefreshFarms: () => void;
  onSaveCurrentFarm: () => Promise<number | null>;
  onSaveRotationPlan: (targetParcelId?: number) => Promise<void>;
  onLoadSavedFarm: (farm: SavedFarmRecord) => void;
  onDeleteSavedFarm: (parcelId: number) => Promise<void>;
  onExportSheet: () => Promise<SheetExportResult | null>;
  onExportDoc: () => Promise<DocExportResult | null>;
  onCreateForm: () => Promise<FormExportResult | null>;
  onReadFormResponses: (formId: string) => Promise<FormResponseSummary[]>;
  sheetResult: SheetExportResult | null;
  docResult: DocExportResult | null;
  formResult: FormExportResult | null;
}

type PendingAction =
  | { type: 'sheet' }
  | { type: 'doc' }
  | { type: 'form' }
  | { type: 'delete-farm'; parcelId: number; name: string }
  | null;

export function WorkspaceHub({
  parcel,
  nasa,
  simulation,
  aiBriefMarkdown,
  user,
  hasWorkspaceToken,
  onSignIn,
  savedFarms,
  farmsLoading,
  onRefreshFarms,
  onSaveCurrentFarm,
  onSaveRotationPlan,
  onLoadSavedFarm,
  onDeleteSavedFarm,
  onExportSheet,
  onExportDoc,
  onCreateForm,
  onReadFormResponses,
  sheetResult,
  docResult,
  formResult,
}: WorkspaceHubProps) {
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [formIdInput, setFormIdInput] = useState('');
  const [responses, setResponses] = useState<FormResponseSummary[] | null>(null);

  const activeFormId = formIdInput.trim() || formResult?.formId || '';

  const handleSaveParcelAndPlan = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    setBusyAction('save-all');
    try {
      const savedParcelId = await onSaveCurrentFarm();
      if (savedParcelId) {
        await onSaveRotationPlan(savedParcelId);
        setStatusMessage(
          `Saved "${parcel.name}" with live NASA POWER telemetry and ${simulation.planName}.`
        );
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to save farm parcel.'
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleConfirmExecute = async () => {
    if (!pendingAction) return;
    setErrorMessage(null);
    setStatusMessage(null);
    setBusyAction(pendingAction.type);
    try {
      if (pendingAction.type === 'sheet') {
        const res = await onExportSheet();
        if (res) {
          setStatusMessage(`Created Google Sheet "${res.title}".`);
        }
      } else if (pendingAction.type === 'doc') {
        const res = await onExportDoc();
        if (res) {
          setStatusMessage(`Created Google Doc "${res.title}".`);
        }
      } else if (pendingAction.type === 'form') {
        const res = await onCreateForm();
        if (res) {
          setFormIdInput(res.formId);
          setStatusMessage(`Created Farmer Intake Form (${res.formId}).`);
        }
      } else if (pendingAction.type === 'delete-farm') {
        await onDeleteSavedFarm(pendingAction.parcelId);
        setStatusMessage(`Removed "${pendingAction.name}".`);
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Action failed. Please try again.'
      );
    } finally {
      setBusyAction(null);
      setPendingAction(null);
    }
  };

  const handleFetchResponses = async () => {
    if (!activeFormId) {
      setErrorMessage('Enter or generate a Google Form ID first.');
      return;
    }
    setErrorMessage(null);
    setBusyAction('read-form');
    try {
      const data = await onReadFormResponses(activeFormId);
      setResponses(data);
      setStatusMessage(
        data.length === 0
          ? 'No farmer responses have been submitted to this form yet.'
          : `Loaded ${data.length} farmer intake response(s).`
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to fetch form responses.'
      );
    } finally {
      setBusyAction(null);
    }
  };

  const confirmDialogConfig = (() => {
    if (!pendingAction) return null;
    if (pendingAction.type === 'sheet') {
      return {
        title: 'Create Google Sheet Export',
        description: `TerraShift will create a new two-tab Google Spreadsheet in your Google Drive ("Rotation_Plan" and "NASA_Telemetry") for ${parcel.name}.`,
        confirmLabel: 'Create Google Sheet',
        destructive: false,
      };
    }
    if (pendingAction.type === 'doc') {
      return {
        title: 'Create Google Doc Adaptation Plan',
        description: `TerraShift will create a new Google Doc in your Google Drive containing the NASA climate summary, ${simulation.steps.length}-year rotation schedule${aiBriefMarkdown ? ', and Gemini agronomic guidance' : ''}.`,
        confirmLabel: 'Create Google Doc',
        destructive: false,
      };
    }
    if (pendingAction.type === 'form') {
      return {
        title: 'Create Farmer Intake Google Form',
        description: `TerraShift will create a 3-question Google Form in your Google Drive to collect on-ground soil, irrigation, and equipment constraints for ${parcel.name}.`,
        confirmLabel: 'Create Google Form',
        destructive: false,
      };
    }
    return {
      title: 'Delete Saved Farm Parcel',
      description: `Permanently delete "${pendingAction.name}" along with its saved NASA telemetry snapshots and rotation plans? This cannot be undone.`,
      confirmLabel: 'Delete Parcel',
      destructive: true,
    };
  })();

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 sm:px-6">
      {/* Header Banner */}
      <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
            Active Field Context & Reporting
          </p>
          <h1 className="mt-1 font-display text-xl font-bold text-slate-950">
            {parcel.name} · {parcel.region}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Active plan: <span className="font-medium text-slate-900">{simulation.planName}</span>{' '}
            · Water savings{' '}
            <span className="font-mono tabular-nums font-semibold text-emerald-700">
              {simulation.adaptedTotals.waterSavingsPct}%
            </span>{' '}
            · Mean GWETROOT{' '}
            <span className="font-mono tabular-nums font-semibold text-sky-700">
              {Math.round(nasa.meanRootMoisture * 100)}%
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {!user ? (
            <button
              type="button"
              onClick={onSignIn}
              className="gsi-material-button"
            >
              <div className="gsi-material-button-content-wrapper">
                <span className="gsi-material-button-contents">
                  Sign in with Google to Sync & Export
                </span>
              </div>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSaveParcelAndPlan}
              disabled={busyAction === 'save-all'}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-60"
            >
              <BookmarkPlus className="h-4 w-4" />
              <span>
                {busyAction === 'save-all'
                  ? 'Saving Parcel & Plan...'
                  : 'Save Active Parcel & Rotation'}
              </span>
            </button>
          )}
        </div>
      </div>

      {statusMessage && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
          {statusMessage}
        </div>
      )}

      {errorMessage && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900">
          {errorMessage}
        </div>
      )}

      {/* Auth / Workspace Scope Reminder */}
      {(!user || !hasWorkspaceToken) && (
        <div className="flex flex-col justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 sm:flex-row sm:items-center">
          <div className="text-sm text-amber-950">
            {!user
              ? 'Sign in with Google to persist your farm parcels across sessions and export directly to Google Sheets, Docs, and Forms.'
              : 'Your Google account is signed in, but Google Workspace OAuth access is held strictly in memory for security. Re-authorize once to enable Google Sheets, Docs, and Forms exports in this session.'}
          </div>
          <button
            type="button"
            onClick={onSignIn}
            className="shrink-0 rounded-lg border border-amber-300 bg-white px-3.5 py-2 text-xs font-semibold text-amber-950 hover:bg-amber-100"
          >
            {user ? 'Grant Workspace Access' : 'Connect Google Account'}
          </button>
        </div>
      )}

      {/* Google Workspace Export Grid */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Card 1: Google Sheets */}
        <section className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700">
                <FileSpreadsheet className="h-4.5 w-4.5" />
              </div>
              <div>
                <h2 className="font-display text-base font-semibold text-slate-950">
                  Google Sheets Matrix
                </h2>
                <p className="text-xs text-slate-500">
                  Rotation_Plan + NASA_Telemetry tabs
                </p>
              </div>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Creates a formatted spreadsheet containing the year-by-year crop sequence, water balance, nitrogen/carbon deltas, and 12-month NASA POWER climatology.
            </p>
          </div>

          <div className="mt-5 space-y-2.5 border-t border-slate-100 pt-4">
            <button
              type="button"
              disabled={!hasWorkspaceToken || busyAction !== null}
              onClick={() => setPendingAction({ type: 'sheet' })}
              className="w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
            >
              Export Rotation to Google Sheet
            </button>
            {sheetResult && (
              <a
                href={sheetResult.spreadsheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
              >
                <span>Open Created Spreadsheet</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </section>

        {/* Card 2: Google Docs */}
        <section className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 text-sky-700">
                <FileText className="h-4.5 w-4.5" />
              </div>
              <div>
                <h2 className="font-display text-base font-semibold text-slate-950">
                  Google Docs Brief
                </h2>
                <p className="text-xs text-slate-500">
                  Executive agronomic field plan
                </p>
              </div>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Generates a shareable adaptation plan document combining NASA Earth observation diagnostics, transition steps, and drought contingency triggers.
            </p>
          </div>

          <div className="mt-5 space-y-2.5 border-t border-slate-100 pt-4">
            <button
              type="button"
              disabled={!hasWorkspaceToken || busyAction !== null}
              onClick={() => setPendingAction({ type: 'doc' })}
              className="w-full rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
            >
              Export Adaptation Plan to Google Doc
            </button>
            {docResult && (
              <a
                href={docResult.documentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800 hover:bg-sky-100"
              >
                <span>Open Created Google Doc</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </section>

        {/* Card 3: Google Forms */}
        <section className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-700">
                <ClipboardList className="h-4.5 w-4.5" />
              </div>
              <div>
                <h2 className="font-display text-base font-semibold text-slate-950">
                  Google Forms Co-Op Intake
                </h2>
                <p className="text-xs text-slate-500">
                  Collect & inspect field constraints
                </p>
              </div>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Creates a 3-question survey for local growers to report compaction, irrigation limits, and market notes, then reads live submitted responses.
            </p>
          </div>

          <div className="mt-5 space-y-2.5 border-t border-slate-100 pt-4">
            <button
              type="button"
              disabled={!hasWorkspaceToken || busyAction !== null}
              onClick={() => setPendingAction({ type: 'form' })}
              className="w-full rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
            >
              Create Farmer Intake Google Form
            </button>

            {formResult && (
              <div className="flex items-center gap-2">
                <a
                  href={formResult.responderUri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                >
                  <span>Responder Link</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
                <a
                  href={formResult.editUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  <span>Edit Form</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                value={activeFormId}
                onChange={(e) => setFormIdInput(e.target.value)}
                placeholder="Paste Google Form ID..."
                className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-1.5 font-mono text-xs text-slate-800 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none"
              />
              <button
                type="button"
                disabled={!hasWorkspaceToken || !activeFormId || busyAction === 'read-form'}
                onClick={handleFetchResponses}
                className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
              >
                {busyAction === 'read-form' ? 'Loading...' : 'Read Responses'}
              </button>
            </div>

            {responses && (
              <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs">
                {responses.length === 0 ? (
                  <p className="text-slate-500">0 responses recorded yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {responses.map((r) => (
                      <li key={r.responseId} className="border-b border-slate-200 pb-1.5 last:border-b-0 last:pb-0">
                        <p className="font-mono text-[11px] text-slate-500">
                          {r.submittedAt ? new Date(r.submittedAt).toLocaleString() : r.responseId}
                        </p>
                        {r.answers.map((a) => (
                          <p key={a.questionId} className="text-slate-800">
                            {a.values.join(', ')}
                          </p>
                        ))}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Saved Parcels & Plans */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-950">
              Saved Farm Parcels & Rotation Archives
            </h2>
            <p className="text-xs text-slate-500">
              Persistent multi-year adaptation records stored with your account
            </p>
          </div>
          {user && (
            <button
              type="button"
              onClick={onRefreshFarms}
              disabled={farmsLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${farmsLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          )}
        </div>

        {!user ? (
          <div className="py-10 text-center text-sm text-slate-500">
            Sign in with Google to view, load, and manage saved farm parcels and rotation plans.
          </div>
        ) : savedFarms.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">
            No saved parcels yet. Click <span className="font-semibold text-slate-700">Save Active Parcel & Rotation</span> above to archive your first field.
          </div>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {savedFarms.map((farm) => (
              <div
                key={farm.id}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/60 p-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-display text-sm font-semibold text-slate-950">
                        {farm.name}
                      </h3>
                      <p className="text-xs text-slate-600">
                        {farm.region} ·{' '}
                        <span className="font-mono tabular-nums">
                          {farm.lat.toFixed(3)}, {farm.lng.toFixed(3)}
                        </span>{' '}
                        · {farm.areaHectares} ha
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setPendingAction({
                          type: 'delete-farm',
                          parcelId: farm.id,
                          name: farm.name,
                        })
                      }
                      className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      title="Delete parcel"
                      aria-label={`Delete ${farm.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {farm.latestSnapshot && (
                    <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-white p-2.5 text-xs">
                      <div>
                        <span className="block text-[10px] uppercase tracking-wider text-slate-500">
                          Precip
                        </span>
                        <span className="font-mono tabular-nums font-semibold text-slate-900">
                          {Math.round(farm.latestSnapshot.annualPrecipMm)} mm
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase tracking-wider text-slate-500">
                          Root Moist
                        </span>
                        <span className="font-mono tabular-nums font-semibold text-sky-700">
                          {Math.round(farm.latestSnapshot.meanRootMoisture * 100)}%
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase tracking-wider text-slate-500">
                          Risk Index
                        </span>
                        <span className="font-mono tabular-nums font-semibold text-amber-700">
                          {farm.latestSnapshot.climateRiskIndex}/100
                        </span>
                      </div>
                    </div>
                  )}

                  {farm.rotationPlans.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {farm.rotationPlans.slice(0, 2).map((plan) => (
                        <div
                          key={plan.id}
                          className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                        >
                          <span className="truncate font-medium text-slate-800">
                            {plan.planName}
                          </span>
                          <span className="shrink-0 font-mono tabular-nums text-emerald-700">
                            {plan.waterSavingsPct}% water · {plan.resilienceScore}/100
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-200 pt-3">
                  <span className="text-[11px] text-slate-500">
                    Saved {new Date(farm.createdAt).toLocaleDateString()}
                  </span>
                  <button
                    type="button"
                    onClick={() => onLoadSavedFarm(farm)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    <span>Load into Observatory</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {confirmDialogConfig && (
        <ConfirmDialog
          open={Boolean(pendingAction)}
          title={confirmDialogConfig.title}
          description={confirmDialogConfig.description}
          confirmLabel={confirmDialogConfig.confirmLabel}
          destructive={confirmDialogConfig.destructive}
          isLoading={busyAction !== null}
          onConfirm={handleConfirmExecute}
          onCancel={() => {
            if (!busyAction) setPendingAction(null);
          }}
        />
      )}
    </div>
  );
}
