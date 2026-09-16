import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  cleanUploadedFileTitle,
  collectUploadFiles,
  DISCOVERY_WIZARD_CONSUMER_TITLES,
  isConfigurationPhaseName,
  isDiscoveryPhaseName,
  isSpreadsheetFilename,
  isWizardConsumerTaskTitle,
  isWizardSourceTaskTitle,
  isWizardWorkbookFilename,
  isWorkbookLink,
  MAX_DISCOVERY_BATCH_FILES,
  normalizeReviewTitle,
  parseWizardWebhookJson,
  REVIEW_REQUIRED_LABEL,
  shouldFanOutWizardWorkbook,
  shouldSpawnConfigurationReview,
  showReviewRequiredBadge,
} from "@/lib/discovery-config-review";

describe("Discovery → Configuration review helpers", () => {
  it("cleans form-named filenames into specialist task titles", () => {
    expect(cleanUploadedFileTitle("Authorization_Form.pdf")).toBe("Authorization Form");
    expect(cleanUploadedFileTitle("Authorization-Form.docx")).toBe("Authorization Form");
    expect(cleanUploadedFileTitle("Clinical Workflows Data Sheet.xlsx")).toBe(
      "Clinical Workflows Data Sheet",
    );
    expect(cleanUploadedFileTitle("AUTHORIZATION_FORM.PDF")).toBe("AUTHORIZATION FORM");
    expect(cleanUploadedFileTitle("ROI.pdf")).toBe("ROI");
    expect(cleanUploadedFileTitle("  /tmp/Letterhead.png")).toBe("Letterhead");
    expect(cleanUploadedFileTitle(".pdf")).toBe("Untitled document");
  });

  it("normalizes titles for dedupe", () => {
    expect(normalizeReviewTitle("Authorization  Form")).toBe("authorization form");
    expect(normalizeReviewTitle("Authorization Form")).toBe(
      normalizeReviewTitle("authorization_form.pdf".replace(/_/g, " ").replace(/\.pdf$/i, "")),
    );
  });

  it("recognizes Discovery and Configuration phase names", () => {
    expect(isDiscoveryPhaseName("Discovery")).toBe(true);
    expect(isDiscoveryPhaseName("discovery")).toBe(true);
    expect(isDiscoveryPhaseName("Site Configuration")).toBe(false);
    expect(isDiscoveryPhaseName("Guided Discovery Meeting")).toBe(false);
    expect(isConfigurationPhaseName("Site Configuration")).toBe(true);
    expect(isConfigurationPhaseName("Configuration")).toBe(true);
    expect(isConfigurationPhaseName("Discovery")).toBe(false);
  });

  it("spawns only for customer uploads on a Discovery phase", () => {
    expect(
      shouldSpawnConfigurationReview({ isCustomer: true, phaseName: "Discovery" }),
    ).toBe(true);
    expect(
      shouldSpawnConfigurationReview({ isCustomer: false, phaseName: "Discovery" }),
    ).toBe(false);
    expect(
      shouldSpawnConfigurationReview({ isCustomer: true, phaseName: "Site Configuration" }),
    ).toBe(false);
    expect(shouldSpawnConfigurationReview({ isCustomer: true, phaseName: null })).toBe(false);
  });

  it("hides the Review required badge after the specialist finishes", () => {
    expect(REVIEW_REQUIRED_LABEL).toBe("Review required");
    expect(showReviewRequiredBadge({ reviewRequired: true, status: "IN_REVIEW" })).toBe(true);
    expect(showReviewRequiredBadge({ reviewRequired: true, status: "DONE" })).toBe(false);
    expect(showReviewRequiredBadge({ reviewRequired: false, status: "IN_REVIEW" })).toBe(false);
    expect(MAX_DISCOVERY_BATCH_FILES).toBe(25);
  });

  it("collects multiple files from a form (batch 3–20)", () => {
    const form = new FormData();
    form.append("file", new File([new Uint8Array([1])], "Authorization_Form.pdf"));
    form.append("file", new File([new Uint8Array([2])], "ROI.pdf"));
    form.append("file", new File([new Uint8Array([3])], "Consent.docx"));
    expect(collectUploadFiles(form).map((f) => f.name)).toEqual([
      "Authorization_Form.pdf",
      "ROI.pdf",
      "Consent.docx",
    ]);
  });

  it("keeps the helper off the Postgres client", () => {
    const src = readFileSync(resolve(process.cwd(), "src/lib/discovery-config-review.ts"), "utf8");
    expect(src).not.toMatch(/from ["']@\/db["']/);
    expect(src).not.toMatch(/from ["']postgres["']/);
    expect(src).not.toMatch(/from ["']@\/lib\/rollup["']/);
    const client = readFileSync(resolve(process.cwd(), "src/components/attachments.tsx"), "utf8");
    expect(client).toMatch(/multiple/);
    expect(client).not.toMatch(/from ["']@\/lib\/discovery-config-review-tasks["']/);
    const actions = readFileSync(resolve(process.cwd(), "src/actions/attachments.ts"), "utf8");
    expect(actions).toMatch(/shouldFanOutWizardWorkbook/);
    expect(actions).toMatch(/attachWizardWorkbookToConfiguration/);
    expect(actions).toMatch(/spawnConfigurationReviewTasks/);
    const webhook = readFileSync(
      resolve(process.cwd(), "src/app/api/discovery-wizard/workbook/route.ts"),
      "utf8",
    );
    expect(webhook).toMatch(/export async function POST/);
    expect(webhook).toMatch(/DISCOVERY_WIZARD_WEBHOOK_SECRET|authorizeDiscoveryWizardWebhook/);
  });
});

describe("Discovery Wizard workbook fan-out helpers", () => {
  it("recognizes wizard source and Configuration consumer titles", () => {
    expect(isWizardSourceTaskTitle("Organization Details Form")).toBe(true);
    expect(isWizardSourceTaskTitle("Guided Discovery Meeting")).toBe(true);
    expect(isWizardSourceTaskTitle("Schedule: Workflow Guided Discovery")).toBe(true);
    expect(isWizardSourceTaskTitle("Submit Documents")).toBe(false);
    expect(isWizardSourceTaskTitle("Clinical Workflows")).toBe(false);

    for (const title of DISCOVERY_WIZARD_CONSUMER_TITLES) {
      expect(isWizardConsumerTaskTitle(title)).toBe(true);
    }
    expect(isWizardConsumerTaskTitle("User Codes and Rates")).toBe(true);
    expect(isWizardConsumerTaskTitle("User Setup")).toBe(false);
    expect(isWizardConsumerTaskTitle("Organization Setup")).toBe(false);
    expect(isWizardConsumerTaskTitle("Guided Discovery Meeting")).toBe(false);
    expect(isWizardConsumerTaskTitle("Payer Setup")).toBe(false);
  });

  it("detects spreadsheet files and wizard-named workbooks", () => {
    expect(isSpreadsheetFilename("Discovery Wizard.xlsx")).toBe(true);
    expect(isSpreadsheetFilename("packet.pdf")).toBe(false);
    expect(isWizardWorkbookFilename("Discovery_Wizard.xlsx")).toBe(true);
    expect(isWizardWorkbookFilename("Organization Details.xlsx")).toBe(true);
    expect(isWizardWorkbookFilename("Sliding_Fee_Scale.xlsx")).toBe(false);
    expect(isWizardWorkbookFilename("Authorization_Form.pdf")).toBe(false);
  });

  it("treats durable Excel URLs as workbooks and ignores Zoom / wizard-host links", () => {
    expect(
      isWorkbookLink(
        "https://contoso.sharepoint.com/sites/impl/Shared%20Documents/Discovery%20Wizard.xlsx",
      ),
    ).toBe(true);
    expect(
      isWorkbookLink("https://1drv.ms/x/s!abc", "CEDAR Discovery Wizard.xlsx"),
    ).toBe(true);
    expect(isWorkbookLink("https://us05web.zoom.us/rec/share/abc")).toBe(false);
    expect(isWorkbookLink("https://calm-mud-0fe119810.7.azurestaticapps.net/")).toBe(false);
    expect(isWorkbookLink("https://teams.microsoft.com/l/meetup-join/19%3a")).toBe(false);
  });

  it("fans out spreadsheets from wizard sources and wizard-named workbooks anywhere", () => {
    expect(
      shouldFanOutWizardWorkbook({
        sourceTitle: "Organization Details Form",
        filename: "CEDAR.xlsx",
      }),
    ).toBe(true);
    expect(
      shouldFanOutWizardWorkbook({
        sourceTitle: "Submit Documents",
        filename: "Discovery Wizard.xlsx",
      }),
    ).toBe(true);
    expect(
      shouldFanOutWizardWorkbook({
        sourceTitle: "Submit Documents",
        filename: "Sliding_Fee_Scale.xlsx",
      }),
    ).toBe(false);
    expect(
      shouldFanOutWizardWorkbook({
        sourceTitle: "Guided Discovery Meeting",
        url: "https://us05web.zoom.us/j/123",
        linkName: "Guided Discovery recording",
      }),
    ).toBe(false);
    expect(
      shouldFanOutWizardWorkbook({
        sourceTitle: "Schedule: Workflow Guided Discovery",
        url: "https://contoso.sharepoint.com/sites/x/Guided%20Discovery.xlsx",
      }),
    ).toBe(true);
  });

  it("parses the Power Automate JSON body", () => {
    const ok = parseWizardWebhookJson({
      acronym: "CEDAR",
      url: "https://contoso.sharepoint.com/sites/x/w.xlsx",
      name: "CEDAR Discovery.xlsx",
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.data.projectCode).toBe("CEDAR");
      expect(ok.data.url).toContain("sharepoint.com");
      expect(ok.data.name).toBe("CEDAR Discovery.xlsx");
    }
    expect(parseWizardWebhookJson({ projectCode: "CEDAR" }).ok).toBe(false);
    expect(parseWizardWebhookJson(null).ok).toBe(false);
  });
});
