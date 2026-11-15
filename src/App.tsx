import { useCallback, useEffect, useMemo, useState } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import type { User } from 'firebase/auth';
import {
  buildDeterministicFallbackPower,
  CURATED_PARCELS,
  optimizeCropRotation,
  type FarmerPriorities,
  type FarmParcelProfile,
  type IrrigationAccess,
  type NasaPowerSummary,
} from './lib/agronomy';
import {
  deleteFarmParcelFromSql,
  fetchGoogleMapsClientKey,
  fetchMapsWeather,
  fetchNasaPowerTelemetry,
  fetchSavedFarms,
  requestAiDeepStrategy,
  saveFarmParcelToSql,
  saveRotationPlanToSql,
  updateRotationPlanExportsSql,
  type MapsWeatherResponse,
  type SavedFarmRecord,
} from './lib/api';
import {
  getWorkspaceAccessToken,
  logoutGoogleAccount,
  signInWithGoogleWorkspace,
  subscribeAuthState,
} from './lib/firebase';
import {
  createFarmerSurveyGoogleForm,
  exportAdaptationBriefToGoogleDoc,
  exportRotationToGoogleSheet,
  fetchGoogleFormResponses,
  type DocExportResult,
  type FormExportResult,
  type SheetExportResult,
} from './lib/workspaceApi';
import { TopNav, type ActiveView } from './components/TopNav';
import { FieldObservatory } from './components/FieldObservatory';
import { FieldTwin3D } from './components/FieldTwin3D';
import { RotationOptimizer } from './components/RotationOptimizer';
import { WorkspaceHub } from './components/WorkspaceHub';

export default function App() {
  const [activeView, setActiveView] = useState<ActiveView>('observatory');
  const [parcel, setParcel] = useState<FarmParcelProfile>(CURATED_PARCELS[0]);
  const [priorities, setPriorities] = useState<FarmerPriorities>({
    waterEfficiency: 75,
    soilHealth: 80,
    yieldStability: 65,
    horizonYears: 4,
    irrigationAccess: CURATED_PARCELS[0].irrigationAccess,
    includeCoverCrops: true,
  });

  const [nasa, setNasa] = useState<NasaPowerSummary>(() =>
    buildDeterministicFallbackPower(
      CURATED_PARCELS[0].lat,
      CURATED_PARCELS[0].lng
    )
  );
  const [nasaLoading, setNasaLoading] = useState(false);
  const [nasaError, setNasaError] = useState<string | null>(null);
  const [weather, setWeather] = useState<MapsWeatherResponse | null>(null);

  const [mapsApiKey, setMapsApiKey] = useState('');
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);

  const [twinYearIndex, setTwinYearIndex] = useState(0);

  // Gemini Deep Strategy state
  const [aiBriefMarkdown, setAiBriefMarkdown] = useState<string | null>(null);
  const [aiBriefMeta, setAiBriefMeta] = useState<{
    model: string;
    latencyMs: number;
  } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Auth, Cloud SQL, and Workspace Export state
  const [user, setUser] = useState<User | null>(null);
  const [hasWorkspaceToken, setHasWorkspaceToken] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [savedFarms, setSavedFarms] = useState<SavedFarmRecord[]>([]);
  const [farmsLoading, setFarmsLoading] = useState(false);
  const [activeSqlParcelId, setActiveSqlParcelId] = useState<number | null>(null);
  const [activeSqlPlanId, setActiveSqlPlanId] = useState<number | null>(null);

  const [sheetResult, setSheetResult] = useState<SheetExportResult | null>(null);
  const [docResult, setDocResult] = useState<DocExportResult | null>(null);
  const [formResult, setFormResult] = useState<FormExportResult | null>(null);

  // Listen for Case A Google Maps Quota events
  useEffect(() => {
    const onQuota = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  // Load Google Maps client key once
  useEffect(() => {
    fetchGoogleMapsClientKey().then((k) => setMapsApiKey(k));
  }, []);

  // Subscribe Firebase Auth
  const loadSavedFarms = useCallback(async () => {
    setFarmsLoading(true);
    try {
      const list = await fetchSavedFarms();
      setSavedFarms(list);
    } catch (err) {
      console.warn('Could not load saved farms:', err);
    } finally {
      setFarmsLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = subscribeAuthState(
      (signedInUser, hasToken) => {
        setUser(signedInUser);
        setHasWorkspaceToken(hasToken);
        loadSavedFarms();
      },
      () => {
        setUser(null);
        setHasWorkspaceToken(false);
        setSavedFarms([]);
      }
    );
    return unsub;
  }, [loadSavedFarms]);

  // Fetch live NASA POWER + Google Weather whenever parcel coordinates change
  useEffect(() => {
    let cancelled = false;
    setNasaLoading(true);
    setNasaError(null);

    fetchNasaPowerTelemetry(parcel.lat, parcel.lng)
      .then((summary) => {
        if (!cancelled) {
          setNasa(summary);
          setNasaLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setNasaError(
            err instanceof Error
              ? `${err.message}. Displaying regional climatology baseline.`
              : 'NASA POWER unavailable; displaying regional climatology baseline.'
          );
          setNasa(buildDeterministicFallbackPower(parcel.lat, parcel.lng));
          setNasaLoading(false);
        }
      });

    fetchMapsWeather(parcel.lat, parcel.lng)
      .then((w) => {
        if (!cancelled) setWeather(w);
      })
      .catch(() => {
        if (!cancelled) setWeather({ available: false });
      });

    return () => {
      cancelled = true;
    };
  }, [parcel.lat, parcel.lng]);

  // Deterministic agronomic optimization recalculated live
  const simulation = useMemo(
    () => optimizeCropRotation(parcel, nasa, priorities),
    [parcel, nasa, priorities]
  );

  const handleSelectParcel = (next: FarmParcelProfile) => {
    setParcel(next);
    setPriorities((prev) => ({
      ...prev,
      irrigationAccess: next.irrigationAccess,
    }));
    setAiBriefMarkdown(null);
    setAiBriefMeta(null);
    setAiError(null);
    setTwinYearIndex(0);
    setActiveSqlParcelId(null);
    setActiveSqlPlanId(null);
  };

  const handleInspectCoordinates = (
    lat: number,
    lng: number,
    label?: string
  ) => {
    const cleanLat = Number(lat.toFixed(4));
    const cleanLng = Number(lng.toFixed(4));
    const customParcel: FarmParcelProfile = {
      id: `custom-${cleanLat}-${cleanLng}`,
      name: label || `Field Sector (${cleanLat.toFixed(2)}, ${cleanLng.toFixed(2)})`,
      region: label || `Lat ${cleanLat.toFixed(2)}, Lng ${cleanLng.toFixed(2)}`,
      lat: cleanLat,
      lng: cleanLng,
      areaHectares: 45,
      soilType: 'Site-Inferred Loam',
      soilPh: 6.6,
      baselineOrganicCarbon: 2.1,
      irrigationAccess: priorities.irrigationAccess,
      currentCropId: 'maize',
      climateZoneNote: 'Live NASA POWER coordinates inspected directly on global grid.',
    };
    setParcel(customParcel);
    setAiBriefMarkdown(null);
    setAiBriefMeta(null);
    setAiError(null);
    setTwinYearIndex(0);
    setActiveSqlParcelId(null);
    setActiveSqlPlanId(null);
  };

  const handleGenerateDeepStrategy = async () => {
    setAiBusy(true);
    setAiError(null);
    try {
      const res = await requestAiDeepStrategy({
        parcel,
        nasa,
        simulation,
        priorities,
      });
      setAiBriefMarkdown(res.markdown);
      setAiBriefMeta({ model: res.model, latencyMs: res.latencyMs });
    } catch (err) {
      setAiError(
        err instanceof Error ? err.message : 'Unable to generate strategy.'
      );
    } finally {
      setAiBusy(false);
    }
  };

  const handleSignIn = async () => {
    setAuthBusy(true);
    try {
      const res = await signInWithGoogleWorkspace();
      setUser(res.user);
      setHasWorkspaceToken(Boolean(res.workspaceToken));
      await loadSavedFarms();
    } catch (err) {
      console.warn('Google sign-in aborted or failed:', err);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    await logoutGoogleAccount();
    setUser(null);
    setHasWorkspaceToken(false);
    setSavedFarms([]);
  };

  const handleSaveCurrentFarm = async (): Promise<number | null> => {
    const saved = await saveFarmParcelToSql(parcel, nasa);
    setActiveSqlParcelId(saved.id);
    await loadSavedFarms();
    return saved.id;
  };

  const handleSaveRotationPlan = async (targetParcelId?: number) => {
    const pid = targetParcelId ?? activeSqlParcelId;
    if (!pid) return;
    const plan = await saveRotationPlanToSql({
      parcelId: pid,
      simulation,
      priorities,
      aiBriefMarkdown,
      sheetUrl: sheetResult?.spreadsheetUrl,
      docUrl: docResult?.documentUrl,
      formUrl: formResult?.responderUri,
    });
    setActiveSqlPlanId(plan.id);
    await loadSavedFarms();
  };

  const handleLoadSavedFarm = (farm: SavedFarmRecord) => {
    const loaded: FarmParcelProfile = {
      id: `sql-${farm.id}`,
      name: farm.name,
      region: farm.region,
      lat: farm.lat,
      lng: farm.lng,
      areaHectares: farm.areaHectares,
      soilType: farm.soilType,
      soilPh: farm.soilPh,
      baselineOrganicCarbon: farm.baselineOrganicCarbon,
      irrigationAccess: (farm.irrigationAccess as IrrigationAccess) || 'rainfed',
      currentCropId: farm.currentCrop,
      climateZoneNote: 'Restored from saved farm parcel archive.',
    };
    setParcel(loaded);
    setActiveSqlParcelId(farm.id);
    const latestPlan = farm.rotationPlans[0];
    if (latestPlan) {
      setActiveSqlPlanId(latestPlan.id);
      setPriorities((prev) => ({
        ...prev,
        horizonYears: latestPlan.horizonYears === 3 ? 3 : 4,
        waterEfficiency: latestPlan.waterPriority,
        soilHealth: latestPlan.soilCarbonPriority,
        yieldStability: latestPlan.yieldPriority,
        irrigationAccess: loaded.irrigationAccess,
      }));
      if (latestPlan.aiBriefMarkdown) {
        setAiBriefMarkdown(latestPlan.aiBriefMarkdown);
      }
    }
    setActiveView('observatory');
  };

  const handleDeleteSavedFarm = async (parcelId: number) => {
    await deleteFarmParcelFromSql(parcelId);
    if (activeSqlParcelId === parcelId) {
      setActiveSqlParcelId(null);
      setActiveSqlPlanId(null);
    }
    await loadSavedFarms();
  };

  const handleExportSheet = async () => {
    const token = getWorkspaceAccessToken();
    if (!token) throw new Error('Google Workspace authorization token missing. Please re-sign in.');
    const res = await exportRotationToGoogleSheet(token, parcel, nasa, simulation);
    setSheetResult(res);
    if (activeSqlPlanId) {
      await updateRotationPlanExportsSql(activeSqlPlanId, {
        sheetUrl: res.spreadsheetUrl,
      }).catch(() => {});
    }
    return res;
  };

  const handleExportDoc = async () => {
    const token = getWorkspaceAccessToken();
    if (!token) throw new Error('Google Workspace authorization token missing. Please re-sign in.');
    const res = await exportAdaptationBriefToGoogleDoc(
      token,
      parcel,
      nasa,
      simulation,
      aiBriefMarkdown
    );
    setDocResult(res);
    if (activeSqlPlanId) {
      await updateRotationPlanExportsSql(activeSqlPlanId, {
        docUrl: res.documentUrl,
      }).catch(() => {});
    }
    return res;
  };

  const handleCreateForm = async () => {
    const token = getWorkspaceAccessToken();
    if (!token) throw new Error('Google Workspace authorization token missing. Please re-sign in.');
    const res = await createFarmerSurveyGoogleForm(token, parcel);
    setFormResult(res);
    if (activeSqlPlanId) {
      await updateRotationPlanExportsSql(activeSqlPlanId, {
        formUrl: res.responderUri,
      }).catch(() => {});
    }
    return res;
  };

  const handleReadFormResponses = async (formId: string) => {
    const token = getWorkspaceAccessToken();
    if (!token) throw new Error('Google Workspace authorization token missing. Please re-sign in.');
    return fetchGoogleFormResponses(token, formId);
  };

  const mainContent = (
    <div className="flex min-h-screen flex-col bg-[#F8FAFC] text-slate-900">
      {mapsQuotaExceeded && (
        <div className="sticky top-0 z-50 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-center text-xs text-amber-900 shadow-sm md:text-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-amber-950 underline hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      <TopNav
        activeView={activeView}
        onSelectView={setActiveView}
        user={user}
        hasWorkspaceToken={hasWorkspaceToken}
        authBusy={authBusy}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
      />

      <main className="flex-1">
        {activeView === 'observatory' && (
          <FieldObservatory
            parcel={parcel}
            onSelectParcel={handleSelectParcel}
            onInspectCoordinates={handleInspectCoordinates}
            nasa={nasa}
            nasaLoading={nasaLoading}
            nasaError={nasaError}
            weather={weather}
            mapsAvailable={Boolean(mapsApiKey)}
            simulation={simulation}
            onOpenTwin3D={() => setActiveView('twin3d')}
            onOpenOptimizer={() => setActiveView('optimizer')}
          />
        )}

        {activeView === 'twin3d' && (
          <FieldTwin3D
            parcel={parcel}
            nasa={nasa}
            simulation={simulation}
            activeYearIndex={twinYearIndex}
            onSelectYearIndex={setTwinYearIndex}
          />
        )}

        {activeView === 'optimizer' && (
          <RotationOptimizer
            parcel={parcel}
            nasa={nasa}
            priorities={priorities}
            onChangePriorities={setPriorities}
            simulation={simulation}
            aiBriefMarkdown={aiBriefMarkdown}
            aiBriefMeta={aiBriefMeta}
            aiBusy={aiBusy}
            aiError={aiError}
            onGenerateDeepStrategy={handleGenerateDeepStrategy}
            onInspectYearIn3D={(yrIdx) => {
              setTwinYearIndex(yrIdx);
              setActiveView('twin3d');
            }}
          />
        )}

        {activeView === 'workspace' && (
          <WorkspaceHub
            parcel={parcel}
            nasa={nasa}
            simulation={simulation}
            priorities={priorities}
            aiBriefMarkdown={aiBriefMarkdown}
            user={user}
            hasWorkspaceToken={hasWorkspaceToken}
            onSignIn={handleSignIn}
            savedFarms={savedFarms}
            farmsLoading={farmsLoading}
            onRefreshFarms={loadSavedFarms}
            onSaveCurrentFarm={handleSaveCurrentFarm}
            onSaveRotationPlan={handleSaveRotationPlan}
            onLoadSavedFarm={handleLoadSavedFarm}
            onDeleteSavedFarm={handleDeleteSavedFarm}
            onExportSheet={handleExportSheet}
            onExportDoc={handleExportDoc}
            onCreateForm={handleCreateForm}
            onReadFormResponses={handleReadFormResponses}
            sheetResult={sheetResult}
            docResult={docResult}
            formResult={formResult}
          />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white px-4 py-3 text-center text-[11px] text-slate-500">
        TerraShift · NASA Space Apps Challenge 2026: Field Shift · Earth Observation data via NASA POWER Agroclimatology API · Maps & Weather via Google Maps Platform
      </footer>
    </div>
  );

  if (mapsApiKey) {
    return (
      <APIProvider apiKey={mapsApiKey} libraries={['marker', 'places']} language="en" region="US">
        {mainContent}
      </APIProvider>
    );
  }

  return mainContent;
}
