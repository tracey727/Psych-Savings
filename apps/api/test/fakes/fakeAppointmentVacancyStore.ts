import type {
  AppointmentVacancyStore,
  CreateVacancyInput,
  LeakagePatternEntry,
  VacancyPatch,
  VacancySummary,
} from "../../src/appointments/store";
import type { AppointmentVacancy } from "../../src/appointments/types";

export class FakeAppointmentVacancyStore implements AppointmentVacancyStore {
  vacancies = new Map<string, AppointmentVacancy>();
  private counter = 0;
  private nextId() {
    return `vac-${++this.counter}`;
  }

  async createVacancy(input: CreateVacancyInput): Promise<AppointmentVacancy> {
    const now = new Date();
    const vacancy: AppointmentVacancy = {
      id: this.nextId(),
      organisationId: input.organisationId,
      workItemId: input.workItemId,
      cancellationReason: input.cancellationReason,
      originalValueCents: input.originalValueCents,
      slotTime: input.slotTime,
      refillOutcome: null,
      recoveredValueCents: null,
      createdAt: now,
      updatedAt: now,
    };
    this.vacancies.set(vacancy.id, vacancy);
    return vacancy;
  }

  async getVacancy(id: string, organisationId: string): Promise<AppointmentVacancy | null> {
    const v = this.vacancies.get(id);
    return v && v.organisationId === organisationId ? v : null;
  }

  async updateVacancy(id: string, organisationId: string, patch: VacancyPatch): Promise<AppointmentVacancy> {
    const v = await this.getVacancy(id, organisationId);
    if (!v) throw new Error("not found");
    Object.assign(v, patch, { updatedAt: new Date() });
    return v;
  }

  async getLeakagePatternCounts(organisationId: string): Promise<LeakagePatternEntry[]> {
    const counts = new Map<string, number>();
    for (const v of this.vacancies.values()) {
      if (v.organisationId !== organisationId) continue;
      counts.set(v.cancellationReason, (counts.get(v.cancellationReason) ?? 0) + 1);
    }
    return [...counts.entries()].map(([reason, count]) => ({ reason, count }));
  }

  async getVacancySummary(organisationId: string): Promise<VacancySummary> {
    const summary: VacancySummary = { totalVacancies: 0, refilled: 0, notRefilled: 0, pending: 0, totalRecoveredValueCents: 0 };
    for (const v of this.vacancies.values()) {
      if (v.organisationId !== organisationId) continue;
      summary.totalVacancies++;
      if (v.refillOutcome === "refilled") {
        summary.refilled++;
        summary.totalRecoveredValueCents += v.recoveredValueCents ?? 0;
      } else if (v.refillOutcome === "not_refilled") {
        summary.notRefilled++;
      } else {
        summary.pending++;
      }
    }
    return summary;
  }
}
