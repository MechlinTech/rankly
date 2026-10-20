import { describe, it, expect } from "vitest";
import { signUp, authedFetch } from "./helpers";
import { CONTACT_PHONE_INVALID_MESSAGE } from "@/lib/crm/validation";

describe("CRM contacts (real server, real Postgres)", () => {
  it("rejects an invalid phone number instead of saving it", async () => {
    const { cookie } = await signUp();

    const companyRes = await authedFetch("/api/crm/companies", cookie, {
      method: "POST",
      body: JSON.stringify({ name: `Phone Validation Co ${Date.now()}` }),
    });
    expect(companyRes.status).toBe(200);
    const company = (await companyRes.json()).company;

    const res = await authedFetch("/api/crm/contacts", cookie, {
      method: "POST",
      body: JSON.stringify({
        name: "Jane Doe",
        phone: "123",
        companyId: company.id,
      }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data?.error?.fieldErrors?.phone).toContain(CONTACT_PHONE_INVALID_MESSAGE);

    const detailRes = await authedFetch(`/api/crm/companies/${company.id}`, cookie);
    const detail = await detailRes.json();
    expect(detail.company.contacts).toHaveLength(0);
  });

  it("accepts and stores a valid phone number", async () => {
    const { cookie } = await signUp();

    const companyRes = await authedFetch("/api/crm/companies", cookie, {
      method: "POST",
      body: JSON.stringify({ name: `Valid Phone Co ${Date.now()}` }),
    });
    expect(companyRes.status).toBe(200);
    const company = (await companyRes.json()).company;

    const res = await authedFetch("/api/crm/contacts", cookie, {
      method: "POST",
      body: JSON.stringify({
        name: "Jane Doe",
        phone: "+1 (555) 019-2834",
        companyId: company.id,
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.contact.phone).toBe("+1 (555) 019-2834");

    const detailRes = await authedFetch(`/api/crm/companies/${company.id}`, cookie);
    const detail = await detailRes.json();
    expect(detail.company.contacts).toHaveLength(1);
    expect(detail.company.contacts[0].phone).toBe("+1 (555) 019-2834");
  });
});
