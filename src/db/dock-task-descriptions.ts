/**
 * Dock-quality task descriptions for PATH playbook titles that are not already
 * covered by training checklists or Discovery/upload attachment copy.
 *
 * Titles are matched via normalizeOverlapTitle (punctuation-insensitive).
 * Do not invent PHI, Storylane URLs, or Dock-native form hosts.
 */
import { normalizeOverlapTitle, playbookTitleAliases } from "@/lib/playbook-meta";

function entries(rows: Array<[string, string]>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [title, text] of rows) {
    out[normalizeOverlapTitle(title)] = text.trim();
  }
  return out;
}

const PARENT =
  "Work the nested items on this list. Check each one off as you go — you do not need to open a separate screen for every line. The customer sees this parent’s status, not the specialist checklist.";

const RECORDING =
  "After the session, attach the Zoom (or other) recording URL on this task so the practice can rewatch it. Same link may also go on the Recordings tab.";

const SCHEDULE_TRAINING =
  "Book the session on the specialist’s calendar and put the date/time on this task. The practice completes this item when the slot is confirmed.";

const CONFIRM_LOGINS =
  "Before the session, confirm the named users have logged into PIMSY. Check this off when they are in; leave a comment if anyone is blocked.";

/** Kickoff, configuration, import, training logistics, RCM, go-live gates. */
export const DOCK_OPERATIONAL_DESCRIPTIONS: Record<string, string> = entries([
  ["Pre-Kickoff", PARENT],
  [
    "Zendesk Company Setup",
    "Create the Zendesk organization for this practice and confirm the support email domain. Link the org from this task when it exists.",
  ],
  [
    "Inbed Bookings",
    "Confirm booking pages for the meeting types this site will use (kickoff / discovery / training). Add the URLs on About when they are ready.",
  ],
  [
    "Add Import Link to Task (if applicable)",
    "If this site imports demographics, paste the import folder/link onto the Submit Import Files task so the practice has one place to drop files.",
  ],
  [
    "Schedule Kickoff",
    "Book the kickoff call with the practice and the assigned specialist. Put the meeting time on this task when it is confirmed.",
  ],
  ["During Kickoff", PARENT],
  [
    "Dock Overview & Threads",
    "Walk the practice through PATH (this workspace): where their tasks live, how to comment, and how to upload files. This is the Dock overview moment.",
  ],
  [
    "Confirm Data Import",
    "During kickoff, confirm whether a demographic import is in scope. If yes, expose import tasks; if no, mark import items N/A on this project only.",
  ],
  [
    "Schedule: Workflow Guided Discovery",
    "Book Workflow Guided Discovery. Click Here on this task opens the Discovery Wizard when the practice is ready to complete org details.",
  ],
  ["Post Kickoff", PARENT],
  [
    "Add Kickoff Meeting Link",
    "Attach the kickoff recording or meeting notes on this task (and Recordings if it is a session recording).",
  ],
  [
    "Create Import Ticket, Import folder, & link to import tasks",
    "Open the import Zendesk ticket, create the import folder, and link both on the import tasks so the practice and specialist share one path.",
  ],
  [
    "Meeting Notes & Recording",
    "Attach Guided Discovery meeting notes and the recording on this task after the call.",
  ],
  [
    "Schedule Weekly Touchpoints",
    "Set the weekly specialist ↔ practice touchpoint cadence and put the booking/link on this task.",
  ],
  [
    'Expose the "Configuration" tab',
    "When Discovery is far enough along, expose the Configuration area for the customer. Do not expose it empty.",
  ],
  ["Organization Setup", PARENT],
  [
    "Org Info",
    "Enter organization details in PIMSY from the Discovery Wizard output (org info the practice submitted). Mark complete when the org record matches what they sent.",
  ],
  [
    "Division Setup",
    "Create divisions / locations from the Discovery output. Match names the practice uses in billing and scheduling.",
  ],
  ["Logos", "Apply the practice logo(s) they uploaded. If files are missing, chase the Upload Company Logo(s) task."],
  ["Business Hours", "Set business hours in PIMSY from what the practice submitted in Discovery."],
  ["User Setup", PARENT],
  [
    "Create Users",
    "Create user accounts from the Discovery Wizard user list. Do not invent users — use the submitted spreadsheet/output.",
  ],
  [
    "User Codes / Rates",
    "Enter user codes and rates from the Discovery output / billing sheet. Complete Billing Code Setup in parallel when codes are shared.",
  ],
  ["Supervision Setup", "Configure supervision relationships from the Discovery output (who supervises whom)."],
  [
    'Expose "Access" tab',
    "Expose Access / Accessing PIMSY for the customer when logins, desktop app, and security key are ready — not before.",
  ],
  [
    "Add Zendesk Users to Org",
    "Add the practice’s named contacts to the Zendesk organization so tickets route correctly.",
  ],
  ["Billing Config", PARENT],
  [
    "Schedule Billing Workflow Discovery Meeting",
    "Book billing workflow discovery with the billing specialist and the practice’s billing lead.",
  ],
  [
    "Billing Workflow Discovery Meeting Notes & Recording",
    "Attach notes and the recording from billing workflow discovery on this task.",
  ],
  [
    "Review Billing Questionnaire Data Sheet",
    "Download what the practice submitted on Billing Questionnaire. Configure billing from that sheet, then mark this complete.",
  ],
  ["Billing Code Setup", "Enter billing codes from the questionnaire and spreadsheet (payers, modifiers, fee schedule)."],
  ["Payer Setup", "Create payers in PIMSY from the accepted-payers spreadsheet the practice uploaded."],
  ["Forms", PARENT],
  [
    "Forms: Note Templates",
    "Build note templates from the Documentation & Forms / clinical workflow output. Match what the practice actually uses.",
  ],
  ["Forms: Intake Assistant", "Configure Intake Assistant / public intake from Discovery and the forms packet."],
  ["Forms: Client Forms", "Load client-facing forms (consents, demographics) from the forms packet."],
  ["Forms: Clinical Forms", "Load clinical forms from the Documentation & Forms packet and clinical workflows sheet."],
  ["Move Forms", "Move completed forms into the live form sets the practice will use at go-live."],
  ["Forms: Public Docs/Word Merge", "Configure public documents and Word merge templates from the forms packet."],
  [
    "Expose Training Tab for Booking",
    "Expose Training for the customer when session booking should start — not while Discovery is still the only open work.",
  ],
  [
    "Tracking",
    "Track import status here (ticket, folder, blockers). Keep comments current so anyone covering the site can pick it up.",
  ],
  [
    "Create Zendesk Ticket and Link here",
    "Open the demographic-import Zendesk ticket and paste the link on this task.",
  ],
  [
    "Create Import Folder and add link to 'Submit Import Files' task",
    "Create the import drop folder and put the link on Submit Import Files so the practice uploads in one place.",
  ],
  [
    "Link Zendesk Ticket",
    "Confirm the import Zendesk ticket is linked on the import parent/tracking task.",
  ],
  [
    "Cleanup & Mapping",
    "Map and clean the source extract (codes, statuses, required fields) before Initial Import. Comment blockers on this task.",
  ],
  [
    "Data Review Meeting",
    "Meet with the practice to review mapped data before Initial Import. Attach notes/recording here.",
  ],
  ["Final Cleanup", "Finish remaining mapping/cleanup after the data review meeting, before Initial Import."],
  ["Initial Import", "Run the initial demographic import into the training/UAT environment."],
  [
    "UAT",
    "Practice reviews imported clients in PIMSY. Comment issues here; mark complete when they sign off on the sample.",
  ],
  [
    "Final Data Submission",
    "Practice uploads the final extract. Download → confirm contents → specialist runs Final Data Import.",
  ],
  ["Final Data Import", "Load the final signed-off extract. Confirm record counts with the practice."],
  ["Training 1: Intro to PIMSY", PARENT],
  ["Training 2: Client Charts", PARENT],
  ["Training 3: Appointments & Notes", PARENT],
  ["Training 4: Group Notes (if applicable)", PARENT],
  ["Training 5: Intake", PARENT],
  ["Schedule Training 1", SCHEDULE_TRAINING],
  ["Schedule Training 2", SCHEDULE_TRAINING],
  ["Schedule Training 3", SCHEDULE_TRAINING],
  ["Schedule Training 4", SCHEDULE_TRAINING],
  ["Schedule Training 5", SCHEDULE_TRAINING],
  ["Schedule ePrescribe training", SCHEDULE_TRAINING],
  [
    "Add Date to Training Task Title",
    "Put the confirmed Training 1 date/time in the Training 1 task title so the list shows when it is.",
  ],
  ["Expose Parking Lot", "Expose the parking-lot / follow-up list for items that did not fit in Training 1."],
  ["Confirm users have logged in (prior to training)", CONFIRM_LOGINS],
  ["Training 1 Recording Link", RECORDING],
  ["Training 2 Recording Link", RECORDING],
  ["Training 3 Recording Link", RECORDING],
  ["Training 4 Recording Link", RECORDING],
  ["Training 5 Recording Link", RECORDING],
  ["Training 6 Recording Link", RECORDING],
  [
    "Paisly Ambient Scribe (self-serve)",
    "If Paisly is in scope, confirm self-serve setup and cover it in Training 3. N/A this task when Ambient Scribe is out of scope.",
  ],
  ["Configuration", "Complete DrFirst / ePrescribe site configuration for this practice."],
  ["Create Site Account", "Create the DrFirst site account for this org."],
  ["Add Users", "Add prescribers and ePrescribe users from the Discovery user list."],
  ["Create DrFirst Ticket", "Open the DrFirst support ticket and link it on this task."],
  ["ePrescribe Admin Setup", "Finish DrFirst admin configuration (locations, roles, routing)."],
  [
    "Send IDP invite (non-EPCS) or EPCS Gold invite to prescribers",
    "Send the correct ID proofing invite to each prescriber (non-EPCS vs EPCS Gold). The practice confirms they received it.",
  ],
  [
    "Prescriber ID proofing",
    "Each prescriber completes ID proofing. Mark complete when all in-scope prescribers are proofed.",
  ],
  ["Initiate LAC Process", "Start the Logical Access Control process with DrFirst for EPCS when in scope."],
  ["PDMP Setup (if applicable)", "Complete PDMP enrollment/setup for this state when required. N/A if not applicable."],
  ["Dr. First Ticket (cc site POC)", "Keep the DrFirst ticket updated and CC the site point of contact."],
  [
    "Submit signup info to the state via the DrFirst bamboo link",
    "Submit state signup through the DrFirst bamboo link the specialist provides. Upload confirmation on this task.",
  ],
  ["Bed Management", "Configure bed management for inpatient / MAT when in scope."],
  ["Bed Management Training Link", RECORDING],
  ["eMAR", "Configure eMAR when in scope."],
  ["eMAR Training Link", RECORDING],
  ["Inventory Management", "Configure inventory management when in scope."],
  ["Inventory Management Training Link", RECORDING],
  ["Messaging", "Configure secure messaging for the practice."],
  ["Messaging config", "Finish messaging configuration (users, locations, routing)."],
  ["eFax Training", "Train the practice on eFax. Attach the session recording on the training-link task."],
  ["Self-Serve: How to Send Fax in Desktop", "Share the desktop eFax how-to (link or file) on this task."],
  ["eFax config", "Configure eFax numbers and routing."],
  ["Labs Training", "Train labs workflow. Attach recording on this task or the labs recording link."],
  ["Labs config", "Configure lab interfaces / ordering for this site."],
  ["EVV Training", "Train EVV when in scope."],
  ["EVV config", "Configure EVV for this site when in scope. N/A if not used."],
  [
    "Clinical End-User Training Prep",
    "Practice prepares clinical staff for end-user training (who attends, logins, sample clients). Mark complete when the roster is ready.",
  ],
  [
    "Admin End-User Training Prep",
    "Practice prepares admin / front-desk staff for end-user training. Mark complete when the roster is ready.",
  ],
  [
    "ClaimMD Enrollment",
    "Complete ClaimMD enrollment. Upload confirmation or the enrollment packet on this task.",
  ],
  ["Account & access verification", "Verify ClaimMD / billing account access for the people who will submit claims."],
  ["Billing Training 1 Recording Link", RECORDING],
  ["Auth Training 1 Recording Link", RECORDING],
  ["Billing Training 3 Recording Link", RECORDING],
  ["Payroll Training 1 Recording Link", RECORDING],
  ["Billing Training 4 Recording Link", RECORDING],
  ["Billing Training 5 Recording Link", RECORDING],
  ["Payroll Training 2 Recording Link", RECORDING],
  ["Client Payment Training Recording Link", RECORDING],
  [
    "Clinical staff are trained on scheduling, client entry, diagnoses, treatment planning, and documentation",
    "Go-live gate: confirm clinical staff can schedule, enter clients, diagnose, treatment-plan, and document. Check off when true.",
  ],
  [
    "All scheduling staff are trained on scheduling, client entry, and payments",
    "Go-live gate: scheduling staff can book, enter clients, and take payments. Check off when true.",
  ],
  [
    "All appointments are set up for the coming day(s)",
    "Go-live gate: the first live day(s) of appointments exist in PIMSY. Check off when true.",
  ],
  [
    "Client portal access has been configured",
    "Go-live gate: client portal is configured for this org. N/A if portal is out of scope.",
  ],
  [
    "Your website is updated for Client Portal and/or Intake Assistant",
    "Go-live gate: the practice website links Client Portal and/or Intake Assistant when those are in scope.",
  ],
  [
    "If applicable: client import has been completed & validated",
    "Go-live gate: import is done and validated, or N/A when there is no import.",
  ],
  [
    "If applicable: credit card configuration completed to accept patient payments",
    "Go-live gate: card payments work in PIMSY, or N/A when not taking cards.",
  ],
  [
    "If applicable: appointment reminders are configured and activated",
    "Go-live gate: reminders are on, or N/A when the practice is not using them at go-live.",
  ],
  [
    "If applicable: eRX has been configured and accounts set up",
    "Go-live gate: ePrescribe is live for in-scope prescribers, or N/A when eRX is out of scope.",
  ],
  [
    "If applicable: telehealth appointments set up for providers + clients",
    "Go-live gate: telehealth is ready, or N/A when not used.",
  ],
  [
    "Please complete this post go-live survey",
    "Practice completes the post go-live survey. Mark done when the response is in.",
  ],
  ["Create RCM Zendesk ticket", "Open the RCM onboarding Zendesk ticket and link it on this task."],
  ["Schedule RCM kickoff", "Book the RCM kickoff with the RCM specialist and the practice billing lead."],
  [
    "Provide payer list and contracts",
    "Practice uploads the payer list and contracts. Specialist uses them for payer setup.",
  ],
  ["Payer setup and validation", "Enter and validate RCM payers from the list the practice uploaded."],
  ["ClaimMD enrollment", "Complete ClaimMD enrollment for the RCM track. Upload confirmation on this task."],
  ["EDI/ERA enrollment tracking", "Track EDI/ERA enrollments per payer. Comment blockers on this task."],
  ["Billing workflow walkthrough", "Walk the practice through the RCM billing workflow they will run day-to-day."],
  ["Claims scrubbing rules configured", "Configure claim scrubbing rules from the billing workflow meeting."],
  ["First claims batch review", "Review the first claims batch with the practice. Attach findings on this task."],
  [
    "Confirm go-forward billing responsibilities",
    "Practice confirms who runs billing vs who the RCM team supports after handoff. Check off when both sides agree.",
  ],
]);

export function operationalDescriptionForTitle(title: string): string | null {
  const direct = DOCK_OPERATIONAL_DESCRIPTIONS[normalizeOverlapTitle(title)];
  if (direct) return direct;
  for (const alias of playbookTitleAliases(title)) {
    const hit = DOCK_OPERATIONAL_DESCRIPTIONS[normalizeOverlapTitle(alias)];
    if (hit) return hit;
  }
  return null;
}
