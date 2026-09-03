import type { Absence, AbsenceType, Handover } from "./types";

export interface CreateAbsenceInput {
  organisationId: string;
  userId: string;
  absenceType: AbsenceType;
  startsAt: Date;
  endsAt: Date | null;
}

export interface CreateHandoverInput {
  organisationId: string;
  absenceId: string;
  workItemId: string;
  transferId: string;
  temporaryOwnerUserId: string;
}

/** Same interface + in-memory-fake + Neon-adapter pattern as every other domain store in this repo. */
export interface AbsenceStore {
  createAbsence(input: CreateAbsenceInput): Promise<Absence>;
  getAbsence(id: string, organisationId: string): Promise<Absence | null>;
  markReturnBriefingCompleted(id: string, organisationId: string, completedAt: Date): Promise<Absence>;

  createHandover(input: CreateHandoverInput): Promise<Handover>;
  getHandover(id: string, organisationId: string): Promise<Handover | null>;
  listHandovers(absenceId: string, organisationId: string): Promise<Handover[]>;
}
