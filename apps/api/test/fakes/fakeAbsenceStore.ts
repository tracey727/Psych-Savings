import type { AbsenceStore, CreateAbsenceInput, CreateHandoverInput } from "../../src/absences/store";
import type { Absence, Handover } from "../../src/absences/types";

export class FakeAbsenceStore implements AbsenceStore {
  absences = new Map<string, Absence>();
  handovers = new Map<string, Handover>();
  private counter = 0;
  private nextId(prefix: string) {
    return `${prefix}-${++this.counter}`;
  }

  async createAbsence(input: CreateAbsenceInput): Promise<Absence> {
    const absence: Absence = {
      id: this.nextId("absence"),
      organisationId: input.organisationId,
      userId: input.userId,
      absenceType: input.absenceType,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      createdAt: new Date(),
      returnBriefingCompletedAt: null,
    };
    this.absences.set(absence.id, absence);
    return absence;
  }

  async getAbsence(id: string, organisationId: string): Promise<Absence | null> {
    const a = this.absences.get(id);
    return a && a.organisationId === organisationId ? a : null;
  }

  async markReturnBriefingCompleted(id: string, organisationId: string, completedAt: Date): Promise<Absence> {
    const a = await this.getAbsence(id, organisationId);
    if (!a) throw new Error("not found");
    a.returnBriefingCompletedAt = completedAt;
    return a;
  }

  async createHandover(input: CreateHandoverInput): Promise<Handover> {
    const handover: Handover = {
      id: this.nextId("handover"),
      organisationId: input.organisationId,
      absenceId: input.absenceId,
      workItemId: input.workItemId,
      transferId: input.transferId,
      temporaryOwnerUserId: input.temporaryOwnerUserId,
      createdAt: new Date(),
    };
    this.handovers.set(handover.id, handover);
    return handover;
  }

  async getHandover(id: string, organisationId: string): Promise<Handover | null> {
    const h = this.handovers.get(id);
    return h && h.organisationId === organisationId ? h : null;
  }

  async listHandovers(absenceId: string, organisationId: string): Promise<Handover[]> {
    return [...this.handovers.values()].filter((h) => h.absenceId === absenceId && h.organisationId === organisationId);
  }
}
