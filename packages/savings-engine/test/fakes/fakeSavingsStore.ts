import type {
  AddEvidenceInput,
  CreateBaselineInput,
  CreateSavingsCaseInput,
  RecordStateChangeInput,
  SavingsCaseFilters,
  SavingsCasePatch,
  SavingsStore,
} from "../../src/store";
import type { SavingsBaseline, SavingsCase, SavingsCaseStateChange, SavingsEvidence } from "../../src/types";

/** In-memory SavingsStore for engine unit tests — same pattern as the other fakes in this repo. */
export class FakeSavingsStore implements SavingsStore {
  baselines = new Map<string, SavingsBaseline>();
  cases = new Map<string, SavingsCase>();
  history: SavingsCaseStateChange[] = [];
  evidence: SavingsEvidence[] = [];
  private counter = 0;

  private nextId(prefix: string) {
    return `${prefix}-${++this.counter}`;
  }

  async createBaseline(input: CreateBaselineInput): Promise<SavingsBaseline> {
    const baseline: SavingsBaseline = { ...input, id: this.nextId("baseline"), createdAt: new Date() };
    this.baselines.set(baseline.id, baseline);
    return baseline;
  }

  async getBaseline(id: string, organisationId: string): Promise<SavingsBaseline | null> {
    const b = this.baselines.get(id);
    return b && b.organisationId === organisationId ? b : null;
  }

  async createCase(input: CreateSavingsCaseInput): Promise<SavingsCase> {
    const now = new Date();
    const savingsCase: SavingsCase = {
      ...input,
      id: this.nextId("case"),
      state: "potential",
      postMinutes: null,
      postAmountCents: null,
      postMeasuredAt: null,
      measuredMinutesReleased: null,
      measuredAmountCents: null,
      annualisedMinutesReleased: null,
      annualisedAmountCents: null,
      labourRateCentsPerHour: null,
      approvedByUserId: null,
      approvedAt: null,
      implementedByUserId: null,
      implementedAt: null,
      measuredAt: null,
      verifiedByUserId: null,
      verifiedAt: null,
      closeReason: null,
      closedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.cases.set(savingsCase.id, savingsCase);
    return savingsCase;
  }

  async getCase(id: string, organisationId: string): Promise<SavingsCase | null> {
    const c = this.cases.get(id);
    return c && c.organisationId === organisationId ? c : null;
  }

  async updateCase(id: string, organisationId: string, patch: SavingsCasePatch): Promise<SavingsCase> {
    const c = await this.getCase(id, organisationId);
    if (!c) throw new Error("not found");
    Object.assign(c, patch, { updatedAt: new Date() });
    return c;
  }

  async listCases(organisationId: string, filters: SavingsCaseFilters): Promise<SavingsCase[]> {
    return [...this.cases.values()].filter((c) => {
      if (c.organisationId !== organisationId) return false;
      if (!filters.includeClosed && c.closedAt !== null) return false;
      if (filters.state && c.state !== filters.state) return false;
      if (filters.category && c.category !== filters.category) return false;
      if (filters.interventionId && c.interventionId !== filters.interventionId) return false;
      if (filters.sourceEntityType && c.sourceEntityType !== filters.sourceEntityType) return false;
      if (filters.sourceEntityId && c.sourceEntityId !== filters.sourceEntityId) return false;
      return true;
    });
  }

  async recordStateChange(input: RecordStateChangeInput): Promise<void> {
    this.history.push({ ...input, id: this.nextId("hist"), changedAt: new Date() });
  }

  async listStateHistory(savingsCaseId: string, organisationId: string): Promise<SavingsCaseStateChange[]> {
    return this.history.filter((h) => h.savingsCaseId === savingsCaseId && h.organisationId === organisationId);
  }

  async addEvidence(input: AddEvidenceInput): Promise<SavingsEvidence> {
    const record: SavingsEvidence = { ...input, id: this.nextId("evidence"), createdAt: new Date() };
    this.evidence.push(record);
    return record;
  }

  async listEvidence(savingsCaseId: string, organisationId: string): Promise<SavingsEvidence[]> {
    return this.evidence.filter((e) => e.savingsCaseId === savingsCaseId && e.organisationId === organisationId);
  }
}
