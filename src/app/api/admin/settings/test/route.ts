import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/super-admin";
import { getIntegrationCredential, getOpenSerpCredential } from "@/lib/admin/integration-credentials";
import {
  testOpenSerp,
  testResend,
  testAnthropic,
  testStripe,
  testDataForSeo,
  testGoogleOAuth,
  testMicrosoftOAuth,
  type TestResult,
} from "@/lib/admin/settings-tester";
import { z } from "zod";

const testSchema = z.object({
  id: z.enum([
    "openserp",
    "resend",
    "anthropic",
    "stripe",
    "dataforseo",
    "google_oauth",
    "microsoft_oauth",
  ]),
  key: z.string().optional(),
  extra: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const { user, response } = await requireSuperAdmin();
  if (!user) return response;

  const body = await req.json().catch(() => null);
  const parsed = testSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid provider specified." }, { status: 400 });
  }

  const { id, key, extra } = parsed.data;

  let result: TestResult;

  switch (id) {
    case "openserp": {
      const { value: configuredKey } = await getOpenSerpCredential();
      const activeKey = key?.trim() || configuredKey;
      if (!activeKey) {
        return NextResponse.json({
          success: false,
          message: "No OpenSERP or SERP_API_KEY provided or configured.",
          latencyMs: 0,
        });
      }
      result = await testOpenSerp(activeKey);
      break;
    }

    case "resend": {
      const activeKey = key?.trim() || (await getIntegrationCredential("RESEND_API_KEY"));
      if (!activeKey) {
        return NextResponse.json({
          success: false,
          message: "No RESEND_API_KEY provided or configured.",
          latencyMs: 0,
        });
      }
      result = await testResend(activeKey);
      break;
    }

    case "anthropic": {
      const activeKey = key?.trim() || (await getIntegrationCredential("ANTHROPIC_API_KEY"));
      if (!activeKey) {
        return NextResponse.json({
          success: false,
          message: "No ANTHROPIC_API_KEY provided or configured.",
          latencyMs: 0,
        });
      }
      result = await testAnthropic(activeKey);
      break;
    }

    case "stripe": {
      const activeKey = key?.trim() || (await getIntegrationCredential("STRIPE_SECRET_KEY"));
      if (!activeKey) {
        return NextResponse.json({
          success: false,
          message: "No STRIPE_SECRET_KEY provided or configured.",
          latencyMs: 0,
        });
      }
      result = await testStripe(activeKey);
      break;
    }

    case "dataforseo": {
      const activeLogin = key?.trim() || (await getIntegrationCredential("DATAFORSEO_LOGIN"));
      const activePass = extra?.trim() || (await getIntegrationCredential("DATAFORSEO_PASSWORD"));
      if (!activeLogin) {
        return NextResponse.json({
          success: false,
          message: "No DataForSEO login provided or configured.",
          latencyMs: 0,
        });
      }
      if (!activePass) {
        return NextResponse.json({
          success: false,
          message: "Enter both the DataForSEO API login and password.",
          latencyMs: 0,
        });
      }
      result = await testDataForSeo(activeLogin, activePass);
      break;
    }

    case "google_oauth": {
      const activeClientId = key?.trim() || (await getIntegrationCredential("GOOGLE_CLIENT_ID"));
      if (!activeClientId) {
        return NextResponse.json({
          success: false,
          message: "No Google Client ID provided or configured.",
          latencyMs: 0,
        });
      }
      result = await testGoogleOAuth(activeClientId);
      break;
    }

    case "microsoft_oauth": {
      const activeClientId = key?.trim() || (await getIntegrationCredential("MICROSOFT_CLIENT_ID"));
      if (!activeClientId) {
        return NextResponse.json({
          success: false,
          message: "No Microsoft Client ID provided or configured.",
          latencyMs: 0,
        });
      }
      result = await testMicrosoftOAuth(activeClientId);
      break;
    }
  }

  return NextResponse.json(result);
}
