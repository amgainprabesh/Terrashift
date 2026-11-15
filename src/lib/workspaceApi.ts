import type {
  FarmParcelProfile,
  NasaPowerSummary,
  RotationSimulationResult,
} from './agronomy';

export interface SheetExportResult {
  spreadsheetId: string;
  spreadsheetUrl: string;
  title: string;
}

export interface DocExportResult {
  documentId: string;
  documentUrl: string;
  title: string;
}

export interface FormExportResult {
  formId: string;
  responderUri: string;
  editUrl: string;
  title: string;
}

export interface FormResponseSummary {
  responseId: string;
  submittedAt: string;
  answers: Array<{ questionId: string; values: string[] }>;
}

async function workspaceFetch(
  url: string,
  accessToken: string,
  init: RequestInit = {}
) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `Google Workspace API error (${res.status}): ${body.slice(0, 220)}`
    );
  }
  return res.json();
}

export async function exportRotationToGoogleSheet(
  accessToken: string,
  parcel: FarmParcelProfile,
  nasa: NasaPowerSummary,
  simulation: RotationSimulationResult
): Promise<SheetExportResult> {
  const title = `TerraShift — ${parcel.name} (${simulation.planName})`;

  // 1. Create spreadsheet with two explicit sheets: Rotation_Plan and NASA_Telemetry
  const created = await workspaceFetch(
    'https://sheets.googleapis.com/v4/spreadsheets',
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        properties: { title },
        sheets: [
          { properties: { title: 'Rotation_Plan' } },
          { properties: { title: 'NASA_Telemetry' } },
        ],
      }),
    }
  );

  const spreadsheetId = created.spreadsheetId as string;
  const spreadsheetUrl = created.spreadsheetUrl as string;

  // Fetch metadata to verify exact sheet titles instead of assuming Sheet1
  const meta = await workspaceFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties.title`,
    accessToken
  );
  const sheetTitles: string[] = (meta.sheets ?? []).map(
    (s: { properties?: { title?: string } }) => s.properties?.title ?? ''
  );
  const rotationTab = sheetTitles[0] || 'Rotation_Plan';
  const nasaTab = sheetTitles[1] || 'NASA_Telemetry';

  const rotationRows = [
    ['TerraShift Crop Rotation & Adaptation Matrix', parcel.name, parcel.region],
    ['Coordinates', `${parcel.lat}, ${parcel.lng}`, `Elevation: ${nasa.elevationM} m`],
    ['Soil Profile', parcel.soilType, `pH ${parcel.soilPh}`, `Baseline SOC: ${parcel.baselineOrganicCarbon}%`],
    ['Water Savings vs Monoculture', `${simulation.adaptedTotals.waterSavingsPct}%`, 'Cumulative Carbon Gain (t C/ha)', `+${simulation.adaptedTotals.cumulativeCarbonDeltaTonHa}`],
    [],
    [
      'Year',
      'Primary Crop',
      'Botanical Family',
      'Season Window',
      'Winter Cover Crop',
      'Water Used (mm)',
      'Deficit (mm)',
      'Projected Root Moisture (%)',
      'N Balance (kg/ha)',
      'Carbon Gain (t/ha)',
      'Resilience Score (/100)',
    ],
    ...simulation.steps.map((s) => [
      `Year ${s.year}`,
      s.primaryCrop.name,
      s.primaryCrop.family,
      s.primaryCrop.seasonWindow,
      s.coverCrop ? s.coverCrop.name : 'None (Fallow)',
      s.waterUsedMm,
      s.waterDeficitMm,
      Math.round(s.projectedRootMoisture * 100),
      s.nitrogenBalanceKgHa,
      s.carbonDeltaTonHa,
      s.yieldResilienceScore,
    ]),
  ];

  const nasaRows = [
    ['NASA POWER Agroclimatology Monthly Averages', nasa.periodLabel, nasa.source],
    ['Mean Temp (C)', nasa.meanTempC, 'Peak Summer Temp (C)', nasa.peakSummerTempC, 'Annual Precip (mm)', nasa.annualPrecipMm],
    [],
    ['Month', 'Mean Temp (C)', 'Monthly Precip (mm)', 'Root-Zone Moisture (0-1)', 'Solar Irradiance (MJ/m2/d)'],
    ...nasa.climatology.map((c) => [
      c.label,
      c.tempC,
      c.precipMmMonth,
      c.rootMoisture,
      c.solarIrradiance,
    ]),
  ];

  await workspaceFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: [
          { range: `'${rotationTab}'!A1`, values: rotationRows },
          { range: `'${nasaTab}'!A1`, values: nasaRows },
        ],
      }),
    }
  );

  return { spreadsheetId, spreadsheetUrl, title };
}

export async function exportAdaptationBriefToGoogleDoc(
  accessToken: string,
  parcel: FarmParcelProfile,
  nasa: NasaPowerSummary,
  simulation: RotationSimulationResult,
  aiBriefMarkdown: string | null
): Promise<DocExportResult> {
  const title = `TerraShift Adaptation Plan — ${parcel.name}`;

  const created = await workspaceFetch(
    'https://docs.googleapis.com/v1/documents',
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({ title }),
    }
  );

  const documentId = created.documentId as string;
  const documentUrl = `https://docs.google.com/document/d/${documentId}/edit`;

  const lines = [
    `${title}\n`,
    `Region: ${parcel.region} (${parcel.lat.toFixed(4)}, ${parcel.lng.toFixed(4)}) · Elevation: ${nasa.elevationM} m · Area: ${parcel.areaHectares} ha\n`,
    `Soil Taxonomy: ${parcel.soilType} (pH ${parcel.soilPh}, Baseline Organic Carbon ${parcel.baselineOrganicCarbon}%)\n\n`,
    `1. NASA POWER EARTH OBSERVATION SUMMARY (${nasa.periodLabel})\n`,
    `• Mean Temperature: ${nasa.meanTempC}°C (Peak Summer: ${nasa.peakSummerTempC}°C, Shift: ${nasa.tempAnomalyC >= 0 ? '+' : ''}${nasa.tempAnomalyC}°C)\n`,
    `• Annual Precipitation: ${nasa.annualPrecipMm} mm (Inter-annual Variability: ${nasa.precipVariabilityPct}%)\n`,
    `• Mean Root-Zone Soil Wetness (GWETROOT): ${Math.round(nasa.meanRootMoisture * 100)}% (Minimum: ${Math.round(nasa.minRootMoisture * 100)}%)\n`,
    `• Climate Risk Index: ${nasa.climateRiskIndex}/100 · Dry Stress Months: ${nasa.dryStressMonths}/12\n\n`,
    `2. RECOMMENDED ROTATION SEQUENCE (${simulation.planName})\n`,
    `• Water Savings vs Continuous ${simulation.baselineMonoculture.crop.name}: ${simulation.adaptedTotals.waterSavingsPct}%\n`,
    `• Cumulative Soil Organic Carbon Gain: +${simulation.adaptedTotals.cumulativeCarbonDeltaTonHa} t C/ha\n`,
    `• Cumulative Net Nitrogen Balance: ${simulation.adaptedTotals.cumulativeNitrogenKgHa} kg N/ha\n`,
    `• Agronomic Resilience Score: ${simulation.adaptedTotals.resilienceScore}/100 (Baseline: ${simulation.baselineMonoculture.resilienceScore}/100)\n\n`,
    ...simulation.steps.map(
      (s) =>
        `Year ${s.year}: ${s.primaryCrop.name} (${s.primaryCrop.family}, ${s.primaryCrop.seasonWindow})${s.coverCrop ? ` + Cover: ${s.coverCrop.name}` : ''}\n   Water: ${s.waterUsedMm} mm | Deficit: ${s.waterDeficitMm} mm | N Balance: ${s.nitrogenBalanceKgHa} kg/ha | Resilience: ${s.yieldResilienceScore}/100\n   Rationale: ${s.rationale}\n\n`
    ),
  ];

  if (aiBriefMarkdown) {
    lines.push('3. AGRONOMIC ADAPTATION GUIDANCE\n');
    lines.push(aiBriefMarkdown.replace(/[#*`]/g, '') + '\n');
  }

  await workspaceFetch(
    `https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}:batchUpdate`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text: lines.join(''),
            },
          },
        ],
      }),
    }
  );

  return { documentId, documentUrl, title };
}

export async function createFarmerSurveyGoogleForm(
  accessToken: string,
  parcel: FarmParcelProfile
): Promise<FormExportResult> {
  const title = `Field Shift Farmer Intake — ${parcel.name}`;
  const created = await workspaceFetch(
    'https://forms.googleapis.com/v1/forms',
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        info: {
          title,
          documentTitle: title,
        },
      }),
    }
  );

  const formId = created.formId as string;
  const responderUri = created.responderUri as string;
  const editUrl = `https://docs.google.com/forms/d/${formId}/edit`;

  await workspaceFetch(
    `https://forms.googleapis.com/v1/forms/${encodeURIComponent(formId)}:batchUpdate`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        requests: [
          {
            updateFormInfo: {
              info: {
                description: `Collect on-ground soil, irrigation, and crop constraints for ${parcel.name} (${parcel.region}) to calibrate NASA Earth observation crop rotation plans.`,
              },
              updateMask: 'description',
            },
          },
          {
            createItem: {
              item: {
                title: 'Primary Adaptation Priority for Next 3-4 Seasons',
                questionItem: {
                  question: {
                    required: true,
                    choiceQuestion: {
                      type: 'RADIO',
                      options: [
                        { value: 'Conserve groundwater & survive dry spells' },
                        { value: 'Rebuild soil organic matter & reduce synthetic N' },
                        { value: 'Maximize cash-grain yield stability' },
                      ],
                    },
                  },
                },
              },
              location: { index: 0 },
            },
          },
          {
            createItem: {
              item: {
                title: 'Observed Field Constraints (select all that apply)',
                questionItem: {
                  question: {
                    required: false,
                    choiceQuestion: {
                      type: 'CHECKBOX',
                      options: [
                        { value: 'Mid-summer root-zone moisture deficit' },
                        { value: 'Topsoil compaction or crusting' },
                        { value: 'Increasing heatwave pollination stress' },
                        { value: 'Monoculture rootworm / fungal pressure' },
                      ],
                    },
                  },
                },
              },
              location: { index: 1 },
            },
          },
          {
            createItem: {
              item: {
                title: 'Local equipment or market notes (e.g. planter spacing, pulse buyer availability)',
                questionItem: {
                  question: {
                    required: false,
                    textQuestion: { paragraph: true },
                  },
                },
              },
              location: { index: 2 },
            },
          },
        ],
      }),
    }
  );

  return { formId, responderUri, editUrl, title };
}

export async function fetchGoogleFormResponses(
  accessToken: string,
  formId: string
): Promise<FormResponseSummary[]> {
  const safeFormId = encodeURIComponent(formId.trim());
  const data = await workspaceFetch(
    `https://forms.googleapis.com/v1/forms/${safeFormId}/responses`,
    accessToken
  );

  const responses = (data.responses ?? []) as Array<{
    responseId?: string;
    lastSubmittedTime?: string;
    answers?: Record<
      string,
      { textAnswers?: { answers?: Array<{ value?: string }> } }
    >;
  }>;

  return responses.map((r) => ({
    responseId: r.responseId ?? 'unknown',
    submittedAt: r.lastSubmittedTime ?? '',
    answers: Object.entries(r.answers ?? {}).map(([questionId, ans]) => ({
      questionId,
      values: (ans.textAnswers?.answers ?? [])
        .map((a) => a.value ?? '')
        .filter(Boolean),
    })),
  }));
}
