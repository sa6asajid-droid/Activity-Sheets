import { json } from "@/lib/server/http";
import { providerStatus } from "@/lib/server/context";
import { getConfig } from "@/lib/config";

export const runtime = "nodejs";

export async function GET() {
  const cfg = getConfig();
  return json({ productName: cfg.productName, providers: providerStatus(), budgetDefaultUsd: cfg.defaultBudgetUsd });
}
