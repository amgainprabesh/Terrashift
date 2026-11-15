import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const farmParcels = pgTable('farm_parcels', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  region: text('region').notNull(),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  areaHectares: doublePrecision('area_hectares').notNull(),
  soilType: text('soil_type').notNull(),
  soilPh: doublePrecision('soil_ph').notNull(),
  baselineOrganicCarbon: doublePrecision('baseline_organic_carbon').notNull(),
  irrigationAccess: text('irrigation_access').notNull(),
  currentCrop: text('current_crop').notNull(),
  isFavorite: boolean('is_favorite').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const nasaSnapshots = pgTable('nasa_snapshots', {
  id: serial('id').primaryKey(),
  parcelId: integer('parcel_id')
    .references(() => farmParcels.id, { onDelete: 'cascade' })
    .notNull(),
  meanTempC: doublePrecision('mean_temp_c').notNull(),
  annualPrecipMm: doublePrecision('annual_precip_mm').notNull(),
  meanRootMoisture: doublePrecision('mean_root_moisture').notNull(),
  meanSurfaceMoisture: doublePrecision('mean_surface_moisture').notNull(),
  solarIrradiance: doublePrecision('solar_irradiance').notNull(),
  elevationM: doublePrecision('elevation_m').notNull(),
  climateRiskIndex: integer('climate_risk_index').notNull(),
  payloadJson: text('payload_json').notNull(),
  capturedAt: timestamp('captured_at').defaultNow().notNull(),
});

export const rotationPlans = pgTable('rotation_plans', {
  id: serial('id').primaryKey(),
  parcelId: integer('parcel_id')
    .references(() => farmParcels.id, { onDelete: 'cascade' })
    .notNull(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  planName: text('plan_name').notNull(),
  horizonYears: integer('horizon_years').notNull(),
  waterPriority: integer('water_priority').notNull(),
  soilCarbonPriority: integer('soil_carbon_priority').notNull(),
  yieldPriority: integer('yield_priority').notNull(),
  sequenceJson: text('sequence_json').notNull(),
  waterSavingsPct: doublePrecision('water_savings_pct').notNull(),
  carbonDeltaTonPerHa: doublePrecision('carbon_delta_ton_per_ha').notNull(),
  nitrogenBalanceKgHa: doublePrecision('nitrogen_balance_kg_ha').notNull(),
  resilienceScore: integer('resilience_score').notNull(),
  aiBriefMarkdown: text('ai_brief_markdown'),
  sheetUrl: text('sheet_url'),
  docUrl: text('doc_url'),
  formUrl: text('form_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  farmParcels: many(farmParcels),
  rotationPlans: many(rotationPlans),
}));

export const farmParcelsRelations = relations(farmParcels, ({ one, many }) => ({
  owner: one(users, {
    fields: [farmParcels.userId],
    references: [users.id],
  }),
  nasaSnapshots: many(nasaSnapshots),
  rotationPlans: many(rotationPlans),
}));

export const nasaSnapshotsRelations = relations(nasaSnapshots, ({ one }) => ({
  parcel: one(farmParcels, {
    fields: [nasaSnapshots.parcelId],
    references: [farmParcels.id],
  }),
}));

export const rotationPlansRelations = relations(rotationPlans, ({ one }) => ({
  parcel: one(farmParcels, {
    fields: [rotationPlans.parcelId],
    references: [farmParcels.id],
  }),
  author: one(users, {
    fields: [rotationPlans.userId],
    references: [users.id],
  }),
}));
