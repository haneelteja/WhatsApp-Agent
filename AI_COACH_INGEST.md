# AI Coach — Spec Ingest, Change Proposals, and Approval Protocol

This document defines how the AI Coach (one instance per tenant) consumes the
Master Spec, proposes changes to configuration, handles approval and rejection,
and maintains a consistent, auditable configuration history.

---

## 1. Spec Ingest (New Spec)

### 1.1 Validation

On first receipt of a compiled JSON spec:

1. Validate against `tenant-master-spec.schema.json` (draft 2020-12).
   - If validation fails: return the list of schema violations with plain-English
     descriptions. Do not proceed until the spec is valid.
2. Verify `checksum` matches `djb2(JSON.stringify(sections, sortedKeys))`.
   - If mismatch: surface as a warning ("Spec may have been manually edited — checksum
     mismatch. Please recompile from the .md source."). Allow override with explicit owner
     confirmation.
3. Record the spec in version history as `v1` with `approved_at: null`.

### 1.2 P0 Gap Review

After validation, compute the gap list from `sections.gap_register.entries` where
`blocking = "P0"`.

Present to the owner as:

```
Your bot can't go live yet. Here are the X things we still need:

1. [Field label] — [business_impact from gap register]
2. ...

Start with #1 now, or continue exploring the platform first?
```

Do **not** present all gaps as a flat list if there are more than 5. Group by section
and present one section at a time.

### 1.3 Guided P0 Completion

For each P0 gap, the AI Coach:

1. Asks the single question defined for that field (from the intake field definition).
2. Accepts the answer and writes it as `{source: "stated", confidence: "high"}`.
3. Generates a minimal change proposal (see §3) and requests approval before writing
   to the live config.
4. On approval, moves the field to `stated` in the gap register and recalculates
   `gap_register.p0_count`.
5. When `p0_count === 0`: confirm "Your bot is ready to go live. Here's what it will
   do from day one: [summary of activated products and scope]."

---

## 2. Spec Change (Existing Spec)

### 2.1 Triggering a Change

A spec change is triggered when:
- The owner says something that contradicts a current field value
  ("Actually, we now deliver to Pune too")
- The owner explicitly asks to update a field
  ("Update the return policy")
- The AI Coach detects a confirmed real-world event that implies a change
  (e.g., a payment webhook confirms a plan renewal → `plan_expires_at` update)
- Periodic re-engagement: the Coach prompts the owner to review specific sections
  at 30, 60, and 90 days post-go-live

### 2.2 Field-Level Diff

For every detected change, produce a field-level diff against the last **approved** version:

```
PROPOSED CHANGE — [timestamp]

§4 Policies > Delivery Coverage

  Before: "We deliver within Hyderabad only."
  After:  "We deliver across Hyderabad and Pune."

Plain-English impact:
  The bot will now tell customers in Pune that delivery is available.
  Currently it would say "we don't deliver to your area."

Source: You mentioned this in our conversation today.
```

Never produce a diff that says only "field X changed from A to B" without a plain-English
impact statement. The impact statement must describe what the bot will say or do
differently as a result.

### 2.3 Change Groups

Changes are grouped by section for approval, except:
- **Guardrail changes** (§7): always isolated, never bundled. See §4.3.
- **Scope changes** (§6): bundled within §6 only.
- **All other sections**: one approval per section per change event.

If a single conversation triggers changes across §3, §4, and §8, present them as
three separate approval requests — one per section — not a single "approve all."

---

## 3. Approval Protocol

### 3.1 Proposal Format

Every change proposal to the owner:

1. States the field and section
2. Shows before/after values
3. Gives a plain-English impact statement
4. Presents two options:
   - **Approve** — applies the change to the live spec immediately
   - **Reject** — retains the prior value; the Coach records the rejection (see §4)

If the owner has questions before deciding, the Coach answers them without
re-generating the proposal. The same proposal stays open until resolved.

### 3.2 Batch vs. Granular

- Up to 3 field changes within the same section may be shown in one proposal block
  (each with its own impact statement), with a single approve/reject per block.
- More than 3 changes in one section: split into sub-groups of ≤3.
- Never batch across sections.
- Never batch guardrail or scope changes with anything else.

### 3.3 On Approval

1. Update the field in the live spec with `approved_at = now()`, `approved_by = owner_id`.
2. Recompute `checksum`.
3. Remove the gap register entry for this field if it existed.
4. Apply change to the live bot configuration via internal API.
5. Confirm to the owner: "Done. [One sentence on what changed.]"

### 3.4 On Rejection

1. Retain the prior field value unchanged.
2. Write a rejection record:
   ```json
   {
     "field_id": "delivery_areas",
     "proposed_value": "Pan-India",
     "proposed_at": "...",
     "rejected_at": "...",
     "rejection_reason": null
   }
   ```
3. Ask if the owner wants to give a reason (optional). If yes, store it.
4. The same proposal must **not** be re-raised for this field in the next 7 days
   unless the owner explicitly asks or contradicts themselves again.
5. The prior value remains in effect and the gap register is not updated.

---

## 4. Guardrail Change Protocol (§7 Special Rules)

Guardrail fields (`never_say`, `escalation_topics`, `competitor_policy`, `pii_policy`,
`regulatory_constraints`) require heightened treatment because incorrect guardrails
can cause the bot to make claims that damage the owner or harm users.

### 4.1 Never Bundle

A guardrail change is always its own approval request. It cannot appear in the same
proposal block as pricing, catalogue, voice, or any other section.

### 4.2 Explicit Confirmation Required

Instead of "Approve / Reject", the prompt is:

```
GUARDRAIL CHANGE — Requires explicit confirmation

§7 Guardrails > Never-say list

  Removing: "Never compare prices to competitors"
  Adding:   (nothing — this item is being removed)

Impact:
  The bot will be able to mention competitor prices after this change.
  This is currently blocked.

Type CONFIRM to apply this change, or CANCEL to keep the current guardrail.
```

The owner must type (or tap) "CONFIRM" explicitly. A soft "yes" or "approve" is not
accepted for guardrail changes. The interface must make this visually distinct.

### 4.3 Audit Trail

Every guardrail change (proposed, approved, rejected) is written to an immutable
audit log with timestamps, the owner's identity, and the change detail. This log
is not editable.

---

## 5. Source and Confidence Management

### 5.1 Upgrading Source on Confirmation

If a field was previously `inferred` or `extracted` and the owner confirms it during
a coaching conversation:
- Upgrade `source` from `inferred`/`extracted` to `stated`
- Upgrade `confidence` to `high`
- Record the conversation turn as `evidence`
- Remove from gap register

### 5.2 Downgrading on Contradiction

If the owner corrects a previously `stated` field:
- The new value is proposed as a change (§3)
- On approval, the old value moves to history; the new value becomes `stated`
- On rejection, the old value is retained and the contradiction is logged

### 5.3 Default Values

Fields set by system default (`source: "default"`) must be surfaced to the owner
during the first 30-day check-in and confirmed or updated. The Coach does not
treat defaults as equivalent to stated values.

---

## 6. Periodic Re-Engagement

| Schedule | Trigger | Action |
|----------|---------|--------|
| Day 7 | Post-go-live | Review §5 Knowledge Base — offer to add more FAQ pairs |
| Day 30 | Post-go-live | Full P1/P2 gap review — fill optional fields |
| Day 60 | Post-go-live | Review §8 Voice and §10 Escalation — has anything changed? |
| Day 90 | Post-go-live | Review §14 Success Criteria — did we hit the goals? |
| Quarterly | Ongoing | Prompt owner to confirm guardrails and scope are still current |
| On product upgrade | Event | Expand §9 Intents and Flows for new activated product; full P0 gap check for new SKU |

The Coach presents these as "time for a quick check-in, not a long form." One section
per session, never all at once.

---

## 7. Version History

Every approved spec state is snapshotted with:
- `version`: integer, auto-incremented
- `snapshot_at`: ISO datetime
- `diff_summary`: array of changed field IDs
- `approved_by`: owner ID
- `checksum`: hash of that snapshot's sections

The AI Coach can reference any prior version for diff display. The owner can roll
back to any prior version by triggering a "revert to v{N}" flow, which itself goes
through the standard approval protocol.

---

## 8. Error States

| Error | Coach behaviour |
|-------|----------------|
| Schema validation failure | Present violations; block go-live; guide owner through fix |
| Checksum mismatch | Warn; require owner to confirm before treating as authorised |
| P0 gap at go-live attempt | Hard block with clear list of what's missing |
| Inferred field not confirmed at go-live | Hard block; cannot go live with unconfirmed inferences in P0 fields |
| Guardrail field missing at go-live | Hard block with explanation of risk |
| Stale spec (>90 days since last approval) | Soft block: "Your spec hasn't been reviewed in 90 days. Let's do a quick check before we make any changes." |

---

## 9. Privacy and Data Handling

- The AI Coach never logs raw customer conversations against the tenant spec.
- Evidence fields in provenance store only short excerpts or source references, never
  full PII-containing documents.
- The intake session content is deleted 30 days after spec approval unless the owner
  explicitly requests archival.
- The approved spec JSON is treated as a business-sensitive document and is not
  shared outside the tenant's account without explicit consent.
