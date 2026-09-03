export type AbsenceType = "planned_leave" | "unexpected";

export interface Absence {
  id: string;
  organisationId: string;
  userId: string;
  absenceType: AbsenceType;
  startsAt: Date;
  endsAt: Date | null;
  createdAt: Date;
  returnBriefingCompletedAt: Date | null;
}

/** Links an absence to the work_item_transfer that carries its acceptance state — see database/migrations/0011_absences_handovers.sql. */
export interface Handover {
  id: string;
  organisationId: string;
  absenceId: string;
  workItemId: string;
  transferId: string;
  temporaryOwnerUserId: string;
  createdAt: Date;
}
