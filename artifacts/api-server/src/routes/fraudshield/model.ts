import { Router, type IRouter } from "express";
import {
  GetDashboardResponse,
  GetFraudTrendsQueryParams,
  GetFraudTrendsResponse,
  GetModelMetricsResponse,
  GetTransactionParams,
  GetTransactionResponse,
  ListTransactionsQueryParams,
  ListTransactionsResponse,
  ScoreTransactionBody,
  ScoreTransactionResponse,
} from "@workspace/api-zod";
import { prisma } from "../../lib/prisma";

const router: IRouter = Router();
const MODEL_API_BASE = (
  process.env.MODEL_API_URL ?? "http://127.0.0.1:8001/model-api"
).replace(/\/+$/, "");

type ModelMetrics = ReturnType<typeof GetModelMetricsResponse.parse>;

const unavailableMetrics = (message: string): ModelMetrics =>
  GetModelMetricsResponse.parse({
    status: "unavailable",
    dataset: "OpenML 42175 mirror of Kaggle mlg-ulb/creditcardfraud",
    datasetRows: null,
    fraudRows: null,
    testRows: null,
    trainRows: null,
    precision: null,
    recall: null,
    f1Score: null,
    confusionMatrix: null,
    splitMethod: null,
    smoteAppliedTo: null,
    threshold: null,
    modelName: null,
    message,
  });

export async function requestModel(
  path: string,
  query?: Record<string, string>,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const url = new URL(`${MODEL_API_BASE}/${path.replace(/^\/+/, "")}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
    signal: AbortSignal.timeout(8_000),
  });
  const body = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, body };
}

async function readModelMetrics(): Promise<ModelMetrics> {
  try {
    const result = await requestModel("metrics");
    if (!result.ok) {
      return unavailableMetrics("The FastAPI model service did not return metrics.");
    }
    return GetModelMetricsResponse.parse(result.body);
  } catch (error) {
    return unavailableMetrics(
      error instanceof Error
        ? `FastAPI model service unavailable: ${error.message}`
        : "FastAPI model service unavailable.",
    );
  }
}

type PolicyDecision = "approve" | "review" | "decline";
type ModelScore = { fraudProbability: number; risk: "Low" | "Medium" | "High" };

function ruleMatches(
  rule: {
    field: "amount" | "fraudProbability" | "time";
    operator: "gt" | "gte" | "lt" | "lte";
    value: number;
  },
  input: { amount: number; time: number; fraudProbability: number },
): boolean {
  const actual = input[rule.field];
  switch (rule.operator) {
    case "gt":
      return actual > rule.value;
    case "gte":
      return actual >= rule.value;
    case "lt":
      return actual < rule.value;
    case "lte":
      return actual <= rule.value;
  }
}

export async function evaluatePolicy(
  input: {
    transactionId?: string;
    amount: number;
    time: number;
  },
  score: ModelScore,
): Promise<{
  policyDecision: PolicyDecision;
  matchedRules: string[];
  listMatch: "allow" | "block" | null;
}> {
  const [rules, listEntries] = await Promise.all([
    prisma.fraudRule.findMany({
      where: { enabled: true },
      orderBy: { createdAt: "asc" },
    }),
    input.transactionId
      ? prisma.listEntry.findMany({
          where: {
            value: input.transactionId.trim(),
            kind: { in: ["allow", "block"] },
          },
        })
      : Promise.resolve([]),
  ]);
  const matchedRules = rules.filter((rule) =>
    ruleMatches(rule, { ...input, fraudProbability: score.fraudProbability }),
  );
  const blocked = listEntries.some((entry) => entry.kind === "block");
  const allowed = listEntries.some((entry) => entry.kind === "allow");

  // A blocklist is the strictest control. Allowlist matches bypass rules; otherwise
  // conflicting rule actions resolve conservatively (decline > review > approve).
  let policyDecision: PolicyDecision;
  if (blocked) {
    policyDecision = "decline";
  } else if (allowed) {
    policyDecision = "approve";
  } else {
    const defaultDecision: PolicyDecision =
      score.risk === "Low" ? "approve" : "review";
    const decisions = [defaultDecision, ...matchedRules.map((rule) => rule.action)];
    const rank: Record<PolicyDecision, number> = {
      approve: 0,
      review: 1,
      decline: 2,
    };
    policyDecision = decisions.reduce((strongest, candidate) =>
      rank[candidate] > rank[strongest] ? candidate : strongest,
    );
  }

  return {
    policyDecision,
    matchedRules: matchedRules.map((rule) => rule.name),
    listMatch: blocked ? "block" : allowed ? "allow" : null,
  };
}

export async function updateGeneratedAlerts(): Promise<void> {
  try {
    const result = await requestModel("alerts", { limit: "50" });
    if (!result.ok || !Array.isArray(result.body)) return;

    for (const candidate of result.body) {
      if (
        typeof candidate !== "object" ||
        candidate === null ||
        !("transactionId" in candidate) ||
        !("risk" in candidate) ||
        !("amount" in candidate) ||
        !("fraudProbability" in candidate)
      ) {
        continue;
      }
      const alert = candidate as {
        transactionId: string;
        risk: "Low" | "Medium" | "High";
        amount: number;
        fraudProbability: number;
      };
      const existing = await prisma.fraudAlert.findUnique({
        where: { transactionId: alert.transactionId },
        select: { id: true },
      });
      if (existing) continue;

      const created = await prisma.fraudAlert.create({
        data: {
          transactionId: alert.transactionId,
          risk: alert.risk,
          amount: alert.amount,
          fraudProbability: alert.fraudProbability,
        },
      });
      await prisma.auditLog.create({
        data: {
          action: "created",
          entity: "alert",
          entityId: created.id,
          summary: `Model flagged ${alert.transactionId} as high risk.`,
        },
      });
    }
  } catch {
    // The dashboard and other analyst workflows remain available without the model service.
  }
}

router.get("/dashboard", async (req, res): Promise<void> => {
  await updateGeneratedAlerts();
  const [metrics, highRiskResult, openAlertCount, openInvestigationCount] =
    await Promise.all([
      readModelMetrics(),
      requestModel("transactions", {
        page: "1",
        pageSize: "1",
        risk: "High",
      }).catch(() => null),
      prisma.fraudAlert.count({ where: { status: "open" } }),
      prisma.investigation.count({ where: { status: { not: "resolved" } } }),
    ]);
  const highRiskCount =
    highRiskResult?.ok &&
    typeof highRiskResult.body === "object" &&
    highRiskResult.body !== null &&
    "datasetAvailable" in highRiskResult.body &&
    highRiskResult.body.datasetAvailable === true &&
    "total" in highRiskResult.body &&
    typeof highRiskResult.body.total === "number"
      ? highRiskResult.body.total
      : null;

  const response = GetDashboardResponse.parse({
    modelStatus: metrics.status,
    datasetRows: metrics.datasetRows,
    fraudRows: metrics.fraudRows,
    testRows: metrics.testRows,
    precision: metrics.precision,
    recall: metrics.recall,
    f1Score: metrics.f1Score,
    confusionMatrix: metrics.confusionMatrix,
    highRiskCount,
    openAlertCount,
    openInvestigationCount,
    message: metrics.message,
  });
  req.log.debug("FraudShield dashboard overview requested");
  res.json(response);
});

router.get("/model/metrics", async (_req, res): Promise<void> => {
  res.json(await readModelMetrics());
});

router.get("/analytics/trends", async (req, res): Promise<void> => {
  const parsed = GetFraudTrendsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const result = await requestModel("trends", {
      buckets: String(parsed.data.buckets ?? 24),
    });
    if (!result.ok) {
      res.json(GetFraudTrendsResponse.parse([]));
      return;
    }
    res.json(GetFraudTrendsResponse.parse(result.body));
  } catch {
    res.json(GetFraudTrendsResponse.parse([]));
  }
});

router.get("/transactions", async (req, res): Promise<void> => {
  const parsed = ListTransactionsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const query: Record<string, string> = {
    page: String(parsed.data.page ?? 1),
    pageSize: String(parsed.data.pageSize ?? 25),
  };
  if (parsed.data.risk) query.risk = parsed.data.risk;
  if (parsed.data.actualFraud !== undefined) {
    query.actualFraud = String(parsed.data.actualFraud);
  }
  if (parsed.data.search) query.search = parsed.data.search;

  try {
    const result = await requestModel("transactions", query);
    if (!result.ok) {
      res.status(result.status).json({ error: "Transaction data is unavailable." });
      return;
    }
    res.json(ListTransactionsResponse.parse(result.body));
  } catch (error) {
    res.json(
      ListTransactionsResponse.parse({
        items: [],
        page: parsed.data.page ?? 1,
        pageSize: parsed.data.pageSize ?? 25,
        total: 0,
        datasetAvailable: false,
        message:
          error instanceof Error
            ? `FastAPI model service unavailable: ${error.message}`
            : "FastAPI model service unavailable.",
      }),
    );
  }
});

router.get("/transactions/:id", async (req, res): Promise<void> => {
  const parsed = GetTransactionParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const result = await requestModel(
      `transactions/${encodeURIComponent(parsed.data.id)}`,
    );
    if (!result.ok) {
      res.status(result.status).json({ error: "Transaction not found." });
      return;
    }
    res.json(GetTransactionResponse.parse(result.body));
  } catch (error) {
    res.status(503).json({
      error:
        error instanceof Error
          ? `FastAPI model service unavailable: ${error.message}`
          : "FastAPI model service unavailable.",
    });
  }
});

router.post("/transactions/score", async (req, res): Promise<void> => {
  const parsed = ScoreTransactionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const result = await requestModel("transactions/score", undefined, {
      method: "POST",
      body: JSON.stringify(parsed.data),
    });
    if (!result.ok) {
      res.status(result.status).json({
        error:
          typeof result.body === "object" &&
          result.body !== null &&
          "detail" in result.body
            ? String(result.body.detail)
            : "The trained model is unavailable.",
      });
      return;
    }
    if (typeof result.body !== "object" || result.body === null) {
      res.status(502).json({ error: "The model returned an invalid score." });
      return;
    }
    const modelScore = result.body as ModelScore & {
      threshold: number;
      modelName: string;
    };
    const policy = await evaluatePolicy(parsed.data, modelScore);
    res.json(
      ScoreTransactionResponse.parse({
        ...modelScore,
        ...policy,
      }),
    );
  } catch (error) {
    res.status(503).json({
      error:
        error instanceof Error
          ? `Model scoring or policy evaluation unavailable: ${error.message}`
          : "Model scoring or policy evaluation unavailable.",
    });
  }
});

export default router;
