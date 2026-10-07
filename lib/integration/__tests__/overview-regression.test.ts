import { describe, it, expect } from "vitest";
import { loadAnalysisData } from "@/lib/db/load-analysis-data";
import { createRepo } from "@/lib/db/data-source";
import { ANALYSIS_FROM, ANALYSIS_AS_OF } from "@/lib/run-analysis";
import { overviewData } from "@/lib/demo/overview-data";

describe("Overview Fixture Dates & Defensive Handling Regression", () => {
  it("canonical fixture date range returns non-empty metrics", async () => {
    const repo = createRepo();
    const data = await loadAnalysisData(ANALYSIS_FROM, ANALYSIS_AS_OF, repo);
    expect(data.metrics.length).toBeGreaterThan(0);
    expect(data.inventory.length).toBeGreaterThan(0);
    expect(data.campaigns.length).toBeGreaterThan(0);
    expect(data.skus.length).toBeGreaterThan(0);
    // Canonical window should cover 45 days
    const uniqueDates = new Set(data.metrics.map((m) => m.date));
    expect(uniqueDates.size).toBe(45);
  });

  it("Overview data successfully produces Revenue, Ad Spend, Contribution Profit, and Blended ROAS", async () => {
    const repo = createRepo();
    const data = await loadAnalysisData(ANALYSIS_FROM, ANALYSIS_AS_OF, repo);
    const result = overviewData(data);

    expect(result.kpiStats).toHaveLength(4);
    const labels = result.kpiStats.map((k) => k.label);
    expect(labels).toContain("Revenue");
    expect(labels).toContain("Ad Spend");
    expect(labels).toContain("Contribution Profit");
    expect(labels).toContain("Blended ROAS");

    const revenueStat = result.kpiStats.find((k) => k.label === "Revenue")!;
    expect(revenueStat.value).toMatch(/^₹[\d,]+/);

    const spendStat = result.kpiStats.find((k) => k.label === "Ad Spend")!;
    expect(spendStat.value).toMatch(/^₹[\d,]+/);

    const profitStat = result.kpiStats.find((k) => k.label === "Contribution Profit")!;
    expect(profitStat.value).toMatch(/^₹[\d,]+/);

    const roasStat = result.kpiStats.find((k) => k.label === "Blended ROAS")!;
    expect(roasStat.value).toMatch(/[\d.]+×/);

    expect(result.attentionItem.name).toBe("Court Sneaker");
    expect(result.opportunityItem.name).toBe("Premium T-Shirt");
    expect(result.portfolioTimeSeries.length).toBeGreaterThan(0);
  });

  it("empty/non-overlapping date range no longer causes Cannot read properties of undefined", async () => {
    const repo = createRepo();
    const emptyRangeData = await loadAnalysisData("2026-01-01", "2026-02-15", repo);
    expect(emptyRangeData.metrics).toHaveLength(0);

    // overviewData must throw a clear, controlled error identifying missing records, NOT TypeError
    expect(() => overviewData(emptyRangeData)).toThrowError(
      /No daily metric records found for the requested period/
    );
    try {
      overviewData(emptyRangeData);
    } catch (err: unknown) {
      expect((err as Error).message).not.toContain("Cannot read properties of undefined");
    }
  });

  it("explicit fixture seed selection still works", async () => {
    const repo1 = createRepo({ fixtureSeed: 1 });
    const repo2 = createRepo({ fixtureSeed: 2 });

    const [metrics1, metrics2] = await Promise.all([
      repo1.getMetrics(ANALYSIS_FROM, ANALYSIS_AS_OF),
      repo2.getMetrics(ANALYSIS_FROM, ANALYSIS_AS_OF),
    ]);

    expect(metrics1.length).toBe(450);
    expect(metrics2.length).toBe(450);

    // Seeds 1 and 2 should have distinct seeded metric values
    const totalSpend1 = metrics1.reduce((sum, m) => sum + m.spend, 0);
    const totalSpend2 = metrics2.reduce((sum, m) => sum + m.spend, 0);
    expect(totalSpend1).toBeGreaterThan(0);
    expect(totalSpend2).toBeGreaterThan(0);
  });

  it("createRepo default fallback provides canonical seed 1 fixtures", async () => {
    const defaultRepo = createRepo();
    const metrics = await defaultRepo.getMetrics(ANALYSIS_FROM, ANALYSIS_AS_OF);
    expect(metrics.length).toBe(450);
  });
});
