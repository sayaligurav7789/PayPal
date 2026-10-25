import { Prisma } from "@prisma/client";
import { Router, type IRouter } from "express";
import {
  CreateInvestigationBody,
  CreateInvestigationResponse,
  CreateListEntryBody,
  CreateListEntryResponse,
  CreateRuleBody,
  CreateRuleResponse,
  DeleteListEntryParams,
  DeleteRuleParams,
  FraudAlert,
  Investigation,
  ListAuditLogsQueryParams,
  ListAuditLogsResponse,
  ListAlertsQueryParams,
  ListAlertsResponse,
  ListEntriesQueryParams,
  ListEntriesResponse,
  ListInvestigationsQueryParams,
  ListInvestigationsResponse,
  ListRulesResponse,
  UpdateAlertBody,
  UpdateAlertParams,
  UpdateAlertResponse,
  UpdateInvestigationBody,
  UpdateInvestigationParams,
  UpdateInvestigationResponse,
  UpdateRuleBody,
  UpdateRuleParams,
  UpdateRuleResponse,
} from "@workspace/api-zod";
import { prisma } from "../../lib/prisma";
import { requestModel, updateGeneratedAlerts } from "./model";

const router: IRouter = Router();

function ruleResponse<T extends { createdAt: Date }>(rule: T) {
  return { ...rule, createdAt: rule.createdAt.toISOString() };
}

function listEntryResponse<T extends { createdAt: Date }>(entry: T) {
  return { ...entry, createdAt: entry.createdAt.toISOString() };
}

function alertResponse(alert: FraudAlert) {
  return {
    ...alert,
    createdAt: alert.createdAt.toISOString(),
  };
}

function investigationResponse(investigation: Investigation) {
  return {
    ...investigation,
    createdAt: investigation.createdAt.toISOString(),
    updatedAt: investigation.updatedAt.toISOString(),
  };
}

function uniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

async function writeAudit(
  tx: Prisma.TransactionClient,
  input: {
    action: string;
    entity: string;
    entityId?: string | null;
    summary: string;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      summary: input.summary,
    },
  });
}

router.get("/rules", async (_req, res): Promise<void> => {
  const rules = await prisma.fraudRule.findMany({
    orderBy: { createdAt: "desc" },
  });
  res.json(ListRulesResponse.parse(rules.map(ruleResponse)));
});

router.post("/rules", async (req, res): Promise<void> => {
  const parsed = CreateRuleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const rule = await prisma.$transaction(async (tx) => {
    const created = await tx.fraudRule.create({
      data: {
        ...parsed.data,
        enabled: parsed.data.enabled ?? true,
      },
    });
    await writeAudit(tx, {
      action: "created",
      entity: "rule",
      entityId: created.id,
      summary: `Created rule "${created.name}".`,
    });
    return created;
  });
  res.status(201).json(CreateRuleResponse.parse(ruleResponse(rule)));
});

router.patch("/rules/:id", async (req, res): Promise<void> => {
  const params = UpdateRuleParams.safeParse(req.params);
  const body = UpdateRuleBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({
      error: params.error.message,
    });
    return;
  }
  if (!body.success) {
    res.status(400).json({
      error: body.error.message,
    });
    return;
  }
  const existing = await prisma.fraudRule.findUnique({
    where: { id: params.data.id },
  });
  if (!existing) {
    res.status(404).json({ error: "Rule not found." });
    return;
  }
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.fraudRule.update({
      where: { id: params.data.id },
      data: body.data,
    });
    await writeAudit(tx, {
      action: "updated",
      entity: "rule",
      entityId: result.id,
      summary: `Updated rule "${result.name}".`,
    });
    return result;
  });
  res.json(UpdateRuleResponse.parse(ruleResponse(updated)));
});

router.delete("/rules/:id", async (req, res): Promise<void> => {
  const params = DeleteRuleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const existing = await prisma.fraudRule.findUnique({
    where: { id: params.data.id },
  });
  if (!existing) {
    res.status(404).json({ error: "Rule not found." });
    return;
  }
  await prisma.$transaction(async (tx) => {
    await tx.fraudRule.delete({ where: { id: params.data.id } });
    await writeAudit(tx, {
      action: "deleted",
      entity: "rule",
      entityId: existing.id,
      summary: `Deleted rule "${existing.name}".`,
    });
  });
  res.sendStatus(204);
});

router.get("/lists", async (req, res): Promise<void> => {
  const parsed = ListEntriesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const entries = await prisma.listEntry.findMany({
    ...(parsed.data.kind ? { where: { kind: parsed.data.kind } } : {}),
    orderBy: { createdAt: "desc" },
  });
  res.json(ListEntriesResponse.parse(entries.map(listEntryResponse)));
});

router.post("/lists", async (req, res): Promise<void> => {
  const parsed = CreateListEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const entry = await prisma.$transaction(async (tx) => {
      const created = await tx.listEntry.create({
        data: {
          kind: parsed.data.kind,
          value: parsed.data.value.trim(),
          reason: parsed.data.reason ?? null,
        },
      });
      await writeAudit(tx, {
        action: "created",
        entity: "list_entry",
        entityId: created.id,
        summary: `Added ${created.kind}list entry "${created.value}".`,
      });
      return created;
    });
    res.status(201).json(CreateListEntryResponse.parse(listEntryResponse(entry)));
  } catch (error) {
    if (uniqueConstraintError(error)) {
      res.status(409).json({ error: "That value is already on this list." });
      return;
    }
    throw error;
  }
});

router.delete("/lists/:id", async (req, res): Promise<void> => {
  const params = DeleteListEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const existing = await prisma.listEntry.findUnique({
    where: { id: params.data.id },
  });
  if (!existing) {
    res.status(404).json({ error: "List entry not found." });
    return;
  }
  await prisma.$transaction(async (tx) => {
    await tx.listEntry.delete({ where: { id: params.data.id } });
    await writeAudit(tx, {
      action: "deleted",
      entity: "list_entry",
      entityId: existing.id,
      summary: `Removed ${existing.kind}list entry "${existing.value}".`,
    });
  });
  res.sendStatus(204);
});

router.get("/alerts", async (req, res): Promise<void> => {
  const parsed = ListAlertsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await updateGeneratedAlerts();
  const alerts = await prisma.fraudAlert.findMany({
    ...(parsed.data.status ? { where: { status: parsed.data.status } } : {}),
    orderBy: { createdAt: "desc" },
  });
  res.json(ListAlertsResponse.parse(alerts.map(alertResponse)));
});

router.patch("/alerts/:id", async (req, res): Promise<void> => {
  const params = UpdateAlertParams.safeParse(req.params);
  const body = UpdateAlertBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({
      error: params.error.message,
    });
    return;
  }
  if (!body.success) {
    res.status(400).json({
      error: body.error.message,
    });
    return;
  }
  const existing = await prisma.fraudAlert.findUnique({
    where: { id: params.data.id },
  });
  if (!existing) {
    res.status(404).json({ error: "Alert not found." });
    return;
  }
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.fraudAlert.update({
      where: { id: params.data.id },
      data: { status: body.data.status },
    });
    await writeAudit(tx, {
      action: body.data.status,
      entity: "alert",
      entityId: result.id,
      summary: `Set alert for ${result.transactionId} to ${result.status}.`,
    });
    return result;
  });
  res.json(UpdateAlertResponse.parse(alertResponse(updated)));
});

router.get("/investigations", async (req, res): Promise<void> => {
  const parsed = ListInvestigationsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const investigations = await prisma.investigation.findMany({
    ...(parsed.data.status ? { where: { status: parsed.data.status } } : {}),
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
  });
  res.json(
    ListInvestigationsResponse.parse(
      investigations.map(investigationResponse),
    ),
  );
});

router.post("/investigations", async (req, res): Promise<void> => {
  const parsed = CreateInvestigationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const modelResult = await requestModel(
      `transactions/${encodeURIComponent(parsed.data.transactionId)}`,
    );
    if (!modelResult.ok) {
      res
        .status(modelResult.status === 404 ? 404 : 503)
        .json({ error: "Investigation requires an existing benchmark transaction." });
      return;
    }
  } catch {
    res.status(503).json({ error: "The model service is unavailable." });
    return;
  }

  try {
    const investigation = await prisma.$transaction(async (tx) => {
      const created = await tx.investigation.create({
        data: {
          transactionId: parsed.data.transactionId,
          priority: parsed.data.priority,
          assignee: parsed.data.assignee ?? null,
          notes: parsed.data.notes ?? null,
        },
      });
      await writeAudit(tx, {
        action: "created",
        entity: "investigation",
        entityId: created.id,
        summary: `Opened an investigation for ${created.transactionId}.`,
      });
      return created;
    });
    res
      .status(201)
      .json(
        CreateInvestigationResponse.parse(
          investigationResponse(investigation),
        ),
      );
  } catch (error) {
    if (uniqueConstraintError(error)) {
      res
        .status(409)
        .json({ error: "An investigation already exists for that transaction." });
      return;
    }
    throw error;
  }
});

router.patch("/investigations/:id", async (req, res): Promise<void> => {
  const params = UpdateInvestigationParams.safeParse(req.params);
  const body = UpdateInvestigationBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({
      error: params.error.message,
    });
    return;
  }
  if (!body.success) {
    res.status(400).json({
      error: body.error.message,
    });
    return;
  }
  const existing = await prisma.investigation.findUnique({
    where: { id: params.data.id },
  });
  if (!existing) {
    res.status(404).json({ error: "Investigation not found." });
    return;
  }
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.investigation.update({
      where: { id: params.data.id },
      data: body.data,
    });
    await writeAudit(tx, {
      action: "updated",
      entity: "investigation",
      entityId: result.id,
      summary: `Updated investigation for ${result.transactionId}.`,
    });
    return result;
  });
  res.json(UpdateInvestigationResponse.parse(investigationResponse(updated)));
});

router.get("/audit-logs", async (req, res): Promise<void> => {
  const parsed = ListAuditLogsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const entries = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: parsed.data.limit ?? 50,
  });
  res.json(
    ListAuditLogsResponse.parse(
      entries.map((entry) => ({
        ...entry,
        createdAt: entry.createdAt.toISOString(),
      })),
    ),
  );
});

export default router;
