import { getRankTrackingProvider } from "./providers";
import type { SerpResult } from "./providers/types";

export interface RankCheckResult {
  domain: string;
  engine: string;
  device: "desktop" | "mobile";
  isMockData: boolean;
  results: SerpResult[];
}

export async function checkRankings(
  domain: string,
  terms: string[],
  engine = "google",
  device: "desktop" | "mobile" = "desktop"
): Promise<RankCheckResult> {
  const provider = getRankTrackingProvider();
  const results = await provider.getRankings(domain, terms, engine, device);

  return {
    domain,
    engine,
    device,
    isMockData: provider.isMock,
    results,
  };
}
