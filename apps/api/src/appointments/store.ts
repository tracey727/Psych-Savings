import type { AppointmentVacancy, RefillOutcome } from "./types";

export interface CreateVacancyInput {
  organisationId: string;
  workItemId: string;
  cancellationReason: string;
  originalValueCents: number | null;
  slotTime: Date | null;
}

export interface VacancyPatch {
  refillOutcome?: RefillOutcome;
  recoveredValueCents?: number | null;
}

export interface LeakagePatternEntry {
  reason: string;
  count: number;
}

export interface VacancySummary {
  totalVacancies: number;
  refilled: number;
  notRefilled: number;
  pending: number;
  totalRecoveredValueCents: number;
}

/** Same interface + in-memory-fake + Neon-adapter pattern as every other domain store in this repo. */
export interface AppointmentVacancyStore {
  createVacancy(input: CreateVacancyInput): Promise<AppointmentVacancy>;
  getVacancy(id: string, organisationId: string): Promise<AppointmentVacancy | null>;
  updateVacancy(id: string, organisationId: string, patch: VacancyPatch): Promise<AppointmentVacancy>;

  /** MODULE_REGISTER.md M03 "repeated cancellation/no-show pattern reporting". */
  getLeakagePatternCounts(organisationId: string): Promise<LeakagePatternEntry[]>;
  getVacancySummary(organisationId: string): Promise<VacancySummary>;
}
