import type { Role } from "@psych-savings/shared-types";

/** Attached to the request once a session has been verified. */
export interface RequestAuthContext {
  userId: string;
  organisationId: string;
  roles: Role[];
  centreIds: string[];
}
