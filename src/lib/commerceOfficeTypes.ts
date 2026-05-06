export type CommerceTaskStatus = "todo" | "doing" | "blocked" | "review" | "done" | "cancelled" | string;
export type CommercePriority = "critical" | "high" | "medium" | "low" | string;

export interface CommerceStaffAccess {
  defaultRole: string;
  allowedSurfaces: string[];
  blockedSurfaces: string[];
}

export interface CommerceWorkQueue {
  id: string;
  title: string;
  owner: string;
  status: string;
}

export interface OperatorTask {
  id: string;
  queueId: string;
  type: "packing" | "stock_count" | "production_log" | "qc" | string;
  title: string;
  assignee: string;
  status: CommerceTaskStatus;
  priority: CommercePriority;
  instructions: string;
  note?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface StockMovementDraft {
  id: string;
  type: "cycle_count" | "adjustment" | "transfer" | string;
  sku: string;
  warehouse: string;
  quantity: number;
  reason: string;
  status: string;
  approvalRequired: boolean;
  approvalId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductionBatchDraft {
  id: string;
  formulaId: string;
  outputSku: string;
  plannedQty: number;
  consumedSkus?: Array<Record<string, unknown>>;
  qcNotes?: string;
  status: string;
  approvalRequired: boolean;
  approvalId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CommerceOfficeState {
  schemaVersion: string;
  updatedAt: string;
  staffAccess: CommerceStaffAccess;
  workQueues: CommerceWorkQueue[];
  operatorTasks: OperatorTask[];
  stockMovementDrafts: StockMovementDraft[];
  productionBatchDrafts: ProductionBatchDraft[];
}

export const EMPTY_COMMERCE_OFFICE_STATE: CommerceOfficeState = {
  schemaVersion: "kaiju-commerce-office-v0",
  updatedAt: "",
  staffAccess: {
    defaultRole: "operator",
    allowedSurfaces: ["workQueue", "packing", "stockCount", "productionLog"],
    blockedSurfaces: ["controlTower", "missionRooms", "oracle", "agents", "runs", "secrets", "costs"],
  },
  workQueues: [],
  operatorTasks: [],
  stockMovementDrafts: [],
  productionBatchDrafts: [],
};
