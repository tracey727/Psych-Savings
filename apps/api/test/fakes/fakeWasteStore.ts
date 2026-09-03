import { OCCURRENCES_PER_YEAR, type WasteCategory } from "@psych-savings/shared-types";
import type {
  CreateInterventionInput,
  CreateWasteEventInput,
  InterventionPatch,
  WasteCategoryTotal,
  WasteEventFilters,
  WasteEventPatch,
  WasteStore,
} from "../../src/waste/store";
import type { ProcessIntervention, WasteEvent } from "../../src/waste/types";

export class FakeWasteStore implements WasteStore {
  events = new Map<string, WasteEvent>();
  interventions = new Map<string, ProcessIntervention>();
  private counter = 0;

  private nextId(prefix: string) {
    return `${prefix}-${++this.counter}`;
  }

  async createWasteEvent(input: CreateWasteEventInput): Promise<WasteEvent> {
    const now = new Date();
    const event: WasteEvent = {
      ...input,
      id: this.nextId("waste"),
      rootCauseCategory: null,
      rootCauseNote: null,
      reviewedAt: null,
      reviewedByUserId: null,
      interventionId: null,
      createdAt: now,
      updatedAt: now,
    };
    this.events.set(event.id, event);
    return event;
  }

  async getWasteEvent(id: string, organisationId: string): Promise<WasteEvent | null> {
    const e = this.events.get(id);
    return e && e.organisationId === organisationId ? e : null;
  }

  async updateWasteEvent(id: string, organisationId: string, patch: WasteEventPatch): Promise<WasteEvent> {
    const e = await this.getWasteEvent(id, organisationId);
    if (!e) throw new Error("not found");
    Object.assign(e, patch, { updatedAt: new Date() });
    return e;
  }

  async listWasteEvents(organisationId: string, filters: WasteEventFilters): Promise<WasteEvent[]> {
    return [...this.events.values()].filter((e) => {
      if (e.organisationId !== organisationId) return false;
      if (filters.category && e.category !== filters.category) return false;
      if (filters.interventionId && e.interventionId !== filters.interventionId) return false;
      if (filters.unreviewedOnly && e.reviewedAt !== null) return false;
      if (filters.reviewedOnly && e.reviewedAt === null) return false;
      return true;
    });
  }

  async createIntervention(input: CreateInterventionInput): Promise<ProcessIntervention> {
    const now = new Date();
    const intervention: ProcessIntervention = {
      ...input,
      id: this.nextId("intervention"),
      implementedAt: null,
      implementedByUserId: null,
      createdAt: now,
      updatedAt: now,
    };
    this.interventions.set(intervention.id, intervention);
    return intervention;
  }

  async getIntervention(id: string, organisationId: string): Promise<ProcessIntervention | null> {
    const i = this.interventions.get(id);
    return i && i.organisationId === organisationId ? i : null;
  }

  async updateIntervention(id: string, organisationId: string, patch: InterventionPatch): Promise<ProcessIntervention> {
    const i = await this.getIntervention(id, organisationId);
    if (!i) throw new Error("not found");
    Object.assign(i, patch, { updatedAt: new Date() });
    return i;
  }

  async getWasteTotalsByCategory(organisationId: string): Promise<WasteCategoryTotal[]> {
    const totals = new Map<WasteCategory, WasteCategoryTotal>();
    for (const e of this.events.values()) {
      if (e.organisationId !== organisationId) continue;
      const entry = totals.get(e.category) ?? {
        category: e.category,
        eventCount: 0,
        totalEstimatedMinutes: 0,
        annualisedMinutes: 0,
      };
      entry.eventCount++;
      entry.totalEstimatedMinutes += e.estimatedMinutes;
      entry.annualisedMinutes += e.estimatedMinutes * OCCURRENCES_PER_YEAR[e.recurrence];
      totals.set(e.category, entry);
    }
    return [...totals.values()];
  }
}
