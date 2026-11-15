import { and, desc, eq } from 'drizzle-orm';
import { db } from './index.ts';
import { farmParcels, nasaSnapshots, rotationPlans } from './schema.ts';

export interface SaveParcelInput {
  name: string;
  region: string;
  lat: number;
  lng: number;
  areaHectares: number;
  soilType: string;
  soilPh: number;
  baselineOrganicCarbon: number;
  irrigationAccess: string;
  currentCrop: string;
  snapshot?: {
    meanTempC: number;
    annualPrecipMm: number;
    meanRootMoisture: number;
    meanSurfaceMoisture: number;
    solarIrradiance: number;
    elevationM: number;
    climateRiskIndex: number;
    payloadJson: string;
  };
}

export interface SaveRotationInput {
  parcelId: number;
  planName: string;
  horizonYears: number;
  waterPriority: number;
  soilCarbonPriority: number;
  yieldPriority: number;
  sequenceJson: string;
  waterSavingsPct: number;
  carbonDeltaTonPerHa: number;
  nitrogenBalanceKgHa: number;
  resilienceScore: number;
  aiBriefMarkdown?: string | null;
  sheetUrl?: string | null;
  docUrl?: string | null;
  formUrl?: string | null;
}

export async function listUserFarms(userId: number) {
  try {
    const parcels = await db
      .select()
      .from(farmParcels)
      .where(eq(farmParcels.userId, userId))
      .orderBy(desc(farmParcels.createdAt));

    const snapshots = await db
      .select()
      .from(nasaSnapshots)
      .orderBy(desc(nasaSnapshots.capturedAt));

    const plans = await db
      .select()
      .from(rotationPlans)
      .where(eq(rotationPlans.userId, userId))
      .orderBy(desc(rotationPlans.createdAt));

    return parcels.map((parcel) => ({
      ...parcel,
      latestSnapshot:
        snapshots.find((snap) => snap.parcelId === parcel.id) ?? null,
      rotationPlans: plans.filter((plan) => plan.parcelId === parcel.id),
    }));
  } catch (error) {
    console.error('Database query listUserFarms failed:', error);
    throw new Error('Failed to load saved farm parcels.', { cause: error });
  }
}

export async function createUserParcel(userId: number, input: SaveParcelInput) {
  try {
    const inserted = await db
      .insert(farmParcels)
      .values({
        userId,
        name: input.name,
        region: input.region,
        lat: input.lat,
        lng: input.lng,
        areaHectares: input.areaHectares,
        soilType: input.soilType,
        soilPh: input.soilPh,
        baselineOrganicCarbon: input.baselineOrganicCarbon,
        irrigationAccess: input.irrigationAccess,
        currentCrop: input.currentCrop,
      })
      .returning();

    const parcel = inserted[0];
    let snapshot = null;

    if (input.snapshot && parcel) {
      const snapRes = await db
        .insert(nasaSnapshots)
        .values({
          parcelId: parcel.id,
          meanTempC: input.snapshot.meanTempC,
          annualPrecipMm: input.snapshot.annualPrecipMm,
          meanRootMoisture: input.snapshot.meanRootMoisture,
          meanSurfaceMoisture: input.snapshot.meanSurfaceMoisture,
          solarIrradiance: input.snapshot.solarIrradiance,
          elevationM: input.snapshot.elevationM,
          climateRiskIndex: input.snapshot.climateRiskIndex,
          payloadJson: input.snapshot.payloadJson,
        })
        .returning();
      snapshot = snapRes[0] ?? null;
    }

    return { ...parcel, latestSnapshot: snapshot, rotationPlans: [] };
  } catch (error) {
    console.error('Database createUserParcel failed:', error);
    throw new Error('Failed to save farm parcel.', { cause: error });
  }
}

export async function deleteUserParcel(userId: number, parcelId: number) {
  try {
    const deleted = await db
      .delete(farmParcels)
      .where(
        and(eq(farmParcels.id, parcelId), eq(farmParcels.userId, userId))
      )
      .returning();
    return deleted[0] ?? null;
  } catch (error) {
    console.error('Database deleteUserParcel failed:', error);
    throw new Error('Failed to delete farm parcel.', { cause: error });
  }
}

export async function createRotationPlan(
  userId: number,
  input: SaveRotationInput
) {
  try {
    const ownedParcel = await db
      .select()
      .from(farmParcels)
      .where(
        and(eq(farmParcels.id, input.parcelId), eq(farmParcels.userId, userId))
      );

    if (!ownedParcel.length) {
      return null;
    }

    const inserted = await db
      .insert(rotationPlans)
      .values({
        parcelId: input.parcelId,
        userId,
        planName: input.planName,
        horizonYears: input.horizonYears,
        waterPriority: input.waterPriority,
        soilCarbonPriority: input.soilCarbonPriority,
        yieldPriority: input.yieldPriority,
        sequenceJson: input.sequenceJson,
        waterSavingsPct: input.waterSavingsPct,
        carbonDeltaTonPerHa: input.carbonDeltaTonPerHa,
        nitrogenBalanceKgHa: input.nitrogenBalanceKgHa,
        resilienceScore: input.resilienceScore,
        aiBriefMarkdown: input.aiBriefMarkdown ?? null,
        sheetUrl: input.sheetUrl ?? null,
        docUrl: input.docUrl ?? null,
        formUrl: input.formUrl ?? null,
      })
      .returning();

    return inserted[0] ?? null;
  } catch (error) {
    console.error('Database createRotationPlan failed:', error);
    throw new Error('Failed to save crop rotation plan.', { cause: error });
  }
}

export async function updateRotationExports(
  userId: number,
  planId: number,
  exports: { sheetUrl?: string; docUrl?: string; formUrl?: string }
) {
  try {
    const existing = await db
      .select()
      .from(rotationPlans)
      .where(
        and(eq(rotationPlans.id, planId), eq(rotationPlans.userId, userId))
      );

    if (!existing.length) {
      return null;
    }

    const updated = await db
      .update(rotationPlans)
      .set({
        sheetUrl: exports.sheetUrl ?? existing[0].sheetUrl,
        docUrl: exports.docUrl ?? existing[0].docUrl,
        formUrl: exports.formUrl ?? existing[0].formUrl,
      })
      .where(
        and(eq(rotationPlans.id, planId), eq(rotationPlans.userId, userId))
      )
      .returning();

    return updated[0] ?? null;
  } catch (error) {
    console.error('Database updateRotationExports failed:', error);
    throw new Error('Failed to update Workspace export links.', {
      cause: error,
    });
  }
}
