// Sample knowledge base: a fictional RevOps playbook for "Northwind Cloud".
// Written for this demo. Replace with your own documents.

export const DOCS = [
  {
    id: "lifecycle",
    title: "Lifecycle stages",
    text: `# Lifecycle stages

Every contact in the CRM has exactly one lifecycle stage. Stages only move forward, except when a lead is recycled. Marketing owns the stages up to marketing qualified lead; sales owns everything after that.

## Subscriber

A subscriber has given us an email address but has not asked to talk to us. Newsletter sign-ups and webinar registrations start here. Subscribers receive content but are never assigned to a salesperson.

## Lead

A lead has shown interest in the product, for example by requesting a trial, downloading a pricing guide or filling in the contact form. Leads are scored automatically every night.

## Marketing qualified lead

A lead becomes a marketing qualified lead (MQL) when its fit score reaches 70 out of 100 and the company matches our ideal customer profile: 50 to 2,000 employees, in B2B software, fintech, IT services, healthtech or logistics. Personal email addresses never qualify, whatever the score. An MQL is assigned to an SDR immediately.

## Sales qualified lead

An MQL becomes a sales qualified lead (SQL) only after an SDR has held a discovery call and confirmed budget, a named decision maker and a timeline within two quarters. The account executive must accept or reject the SQL within two business days.

## Recycling

If an MQL is not contacted within five business days, it is recycled back to lead and enrolled in nurture, and the SDR's manager is notified. A rejected SQL is also recycled, with the rejection reason recorded on the contact.`
  },
  {
    id: "routing",
    title: "Lead routing and response times",
    text: `# Lead routing and response times

Routing is automatic and based on the company's headquarters country, not the contact's location.

## Territories

Leads from India are assigned round robin across the India SDR pod. Leads from the UAE, Saudi Arabia and the rest of the GCC go to the Middle East SDR. Leads from North America, the United Kingdom and Europe go to the global SDR team. Anything that does not match a territory goes to the global queue.

## Enterprise accounts

Companies with more than 1,000 employees skip the SDR team. They are routed directly to the named enterprise account executive for their region, who owns the first call.

## Partner referrals

Leads referred by an implementation partner are routed to the partner manager, who introduces the account executive within one business day. Partner referrals are never sent to the round robin.

## Response SLAs

High urgency leads, such as demo requests that mention a deadline, must receive a first touch within one business hour. All other MQLs must be contacted within four business hours. Response time is measured from assignment, and breaches are reported to the sales manager every Monday.

## Out of hours

Leads that arrive on weekends or public holidays are assigned on the next business morning at 9:00 local time, and the SLA clock starts then.`
  },
  {
    id: "discounts",
    title: "Discount approvals",
    text: `# Discount approvals

Discounts are a tool for closing, not for opening conversations. Always present list price first.

## Approval levels

An account executive can approve a discount of up to 10 percent on the annual subscription without anyone else. A discount between 10 and 20 percent needs approval from the sales manager. Anything above 20 percent needs both the VP of Sales and the finance controller.

## Multi-year deals

Customers who sign a two-year contract and prepay the full amount can receive an additional 5 percent on top of the approved discount. Three-year contracts do not receive more than the two-year rate.

## What cannot be discounted

Implementation services, training packages and premium support are never discounted. If a customer pushes on implementation cost, reduce scope instead of price.

## Recording approvals

Every approved discount must be recorded in the deal's discount approval field, with the approver's name, before the quote is sent. Quotes with an unrecorded discount are blocked by the quoting tool.`
  },
  {
    id: "objections",
    title: "Objection handling",
    text: `# Objection handling

Acknowledge the concern, ask one question to understand it, then answer. Do not argue.

## It is too expensive

Move the conversation from price to cost. Ask how many hours the team spends today on manual lead assignment and reporting, then show the payback period using the ROI worksheet. Only discuss discounts once the value is agreed.

## We already use Salesforce

Do not criticise their current CRM. Offer a migration plan: data mapping workshop, a sandbox import of their last twelve months of data, and a typical timeline of six to eight weeks. Share the case study from a customer who migrated with a team of similar size.

## We need a security review first

Offer our SOC 2 Type II report under NDA, the data processing agreement and the completed security questionnaire. Security reviews usually take two to three weeks, so start them in parallel with the commercial discussion.

## Not the right time

Ask what would need to change for the timing to be right. Create a follow-up task for 90 days and enrol the contact in the relevant nurture sequence instead of closing the deal as lost.`
  },
  {
    id: "handoffs",
    title: "Handoffs and onboarding",
    text: `# Handoffs and onboarding

A handoff is complete only when the receiving person confirms they have everything below.

## SDR to account executive

The SDR books the meeting in the account executive's calendar and attaches the discovery notes, which must cover budget, decision maker, timeline and current tools. The call recording link and the agreed next step go in the deal record. The account executive confirms acceptance within two business days.

## Account executive to customer success

When a deal is closed won, the account executive completes the handoff form within 24 hours. It lists the success criteria the customer agreed to, the stakeholders, any promises made during the sale and the contract start date. The kickoff call with customer success must happen within five business days of closed won.

## Early churn signals

Customer success flags an account as at risk if weekly active users fall by more than 30 percent over a month, if the main champion leaves the company, or if two support tickets in a row are rated unsatisfactory. At-risk accounts get an executive sponsor call within ten business days.`
  }
];

// Questions with the section that actually answers them, used to measure retrieval.
export const EVAL_SET = [
  { q: "Who can approve a 15 percent discount?", doc: "discounts", heading: "Approval levels" },
  { q: "How quickly must we reply to an urgent demo request?", doc: "routing", heading: "Response SLAs" },
  { q: "What makes a lead an MQL?", doc: "lifecycle", heading: "Marketing qualified lead" },
  { q: "What happens if nobody contacts an MQL for a week?", doc: "lifecycle", heading: "Recycling" },
  { q: "Where do leads from Dubai get routed?", doc: "routing", heading: "Territories" },
  { q: "Can we give a discount on implementation services?", doc: "discounts", heading: "What cannot be discounted" },
  { q: "The prospect says they are happy with Salesforce. What do I say?", doc: "objections", heading: "We already use Salesforce" },
  { q: "Do we share our SOC 2 report?", doc: "objections", heading: "We need a security review first" },
  { q: "What should the SDR attach when handing a deal to an AE?", doc: "handoffs", heading: "SDR to account executive" },
  { q: "How soon after closing should the customer kickoff happen?", doc: "handoffs", heading: "Account executive to customer success" },
  { q: "Who handles a lead from a company with 5,000 employees?", doc: "routing", heading: "Enterprise accounts" },
  { q: "Is there extra discount for paying two years upfront?", doc: "discounts", heading: "Multi-year deals" }
];
