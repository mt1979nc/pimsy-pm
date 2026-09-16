import { NextResponse } from "next/server";

import {
  attachWizardWorkbookToConfiguration,
  authorizeDiscoveryWizardWebhook,
  findProjectByDiscoveryCode,
  hashUploadBytes,
  workbookLinkFromUrl,
  type WizardWorkbook,
} from "@/lib/discovery-config-review-tasks";
import { parseWizardWebhookJson } from "@/lib/discovery-config-review";
import { checkUpload } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Power Automate (or the wizard host) delivers the multi-tab Discovery Excel
 * after submit. PATH never receives that workbook today — the SWA posts JSON
 * to a Flow URL with no project acronym.
 *
 * Auth: Bearer DISCOVERY_WIZARD_WEBHOOK_SECRET, falling back to
 * PRISM_READ_API_KEY. Unauthenticated reads get 404, not 403.
 *
 * Body:
 *   application/json  { projectCode, url, name? }
 *   multipart/form-data  projectCode + file  (or url)
 */
export async function POST(req: Request) {
  if (!authorizeDiscoveryWizardWebhook(req.headers.get("authorization"))) {
    return new NextResponse("Not found", { status: 404 });
  }

  let projectCode = "";
  let workbook: WizardWorkbook | null = null;
  let parseError: string | null = null;

  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      projectCode = String(
        form.get("projectCode") ??
          form.get("acronym") ??
          form.get("code") ??
          "",
      ).trim();
      const fileItem = form.get("file") ?? form.get("files") ?? form.get("workbook");
      const urlRaw = String(form.get("url") ?? "").trim();
      const nameRaw = String(form.get("name") ?? "").trim() || undefined;

      if (fileItem instanceof File && fileItem.size > 0) {
        const check = checkUpload(fileItem.name, fileItem.type, fileItem.size);
        if (!check.ok) {
          return NextResponse.json({ error: check.reason }, { status: 400 });
        }
        const bytes = Buffer.from(await fileItem.arrayBuffer());
        workbook = {
          kind: "FILE",
          name: fileItem.name.slice(0, 200),
          mimeType: fileItem.type || null,
          sizeBytes: fileItem.size,
          contentHash: hashUploadBytes(bytes),
          bytes,
        };
      } else if (urlRaw) {
        const link = workbookLinkFromUrl(urlRaw, nameRaw);
        if ("error" in link) {
          return NextResponse.json({ error: link.error }, { status: 400 });
        }
        workbook = link;
      } else {
        parseError = "Missing file or url.";
      }
    } else {
      const body: unknown = await req.json().catch(() => null);
      const parsed = parseWizardWebhookJson(body);
      if (!parsed.ok) {
        parseError = parsed.error;
      } else {
        projectCode = parsed.data.projectCode;
        const link = workbookLinkFromUrl(parsed.data.url, parsed.data.name);
        if ("error" in link) {
          return NextResponse.json({ error: link.error }, { status: 400 });
        }
        workbook = link;
      }
    }
  } catch (err) {
    console.error("discovery-wizard workbook parse failed", err);
    return NextResponse.json({ error: "Could not read that payload." }, { status: 400 });
  }

  if (parseError || !workbook) {
    return NextResponse.json({ error: parseError ?? "Missing workbook." }, { status: 400 });
  }
  if (!projectCode) {
    return NextResponse.json(
      { error: "Missing projectCode (or acronym / code)." },
      { status: 400 },
    );
  }

  const project = await findProjectByDiscoveryCode(projectCode);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  try {
    const result = await attachWizardWorkbookToConfiguration({
      actor: null,
      projectId: project.id,
      workbook,
    });
    return NextResponse.json({
      ok: true,
      projectId: project.id,
      projectCode: project.code,
      attached: result.attachedTaskIds.length,
      skipped: result.skipped,
      consumers: result.consumerCount,
      attachedTaskIds: result.attachedTaskIds,
      reason: result.reason ?? null,
    });
  } catch (err) {
    console.error("attachWizardWorkbookToConfiguration failed", err);
    return NextResponse.json({ error: "Could not attach the workbook." }, { status: 500 });
  }
}
