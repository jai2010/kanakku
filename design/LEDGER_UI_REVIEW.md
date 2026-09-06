# SUTRA Ledger UI — remaining improvements

**Date:** 2026-09-06  
**Author:** Grok (post-implementation review)  
**Scope:** The Ledger surface after the account-centric General Ledger upgrade, plus the Engine ↔ Ledger join.  
**Not in scope:** Redesigning the Engine visualization, changing accounting semantics, or building a full financial reporting suite.

This note is written so it can be reviewed independently (e.g. by ChatGPT) without the repo.

---

## 1. What just shipped (baseline)

Ledger is no longer a journal-history / receipt list. It is an account-centric General Ledger.

**Information architecture now**

```
Engine / Rules / Ledger / Replay
                      │
                      ▼
                   Ledger
        ┌─────────────┼──────────────┐
        ▼             ▼              ▼
    Accounts      Journals     Trial Balance
        │             │
        ▼             ▼
  Account ledger   Journal detail
        │             │
        └──────┬──────┘
               ▼
        View in Engine  →  Engine visualization (no double-post)
```

**Kernel (correct, do not reopen)**

- Balances are **derived** from posted journal lines.
- `Account` does not store a mutable balance.
- React does not compute accounting.
- Normal-balance rules are respected:

  | Type | Debit | Credit |
  |---|---:|---:|
  | Asset / Expense | ↑ | ↓ |
  | Liability / Equity / Income | ↓ | ↑ |

- Trial balance is net-side, not gross movement.
- Header totals are gross movement (`Σ debits` / `Σ credits`).
- Reversals stay in the ledger (original + reversal) so they net to zero.

That architecture is the right foundation. Remaining work is **product, information architecture, and demo clarity**, not more accounting machinery.

---

## 2. Verdict

The mental model is now correct. The screen still does not fully *feel* like a general ledger.

The original sketch was a **two-pane GL**:

```
Accounts (left)                         Activity (right)
Business Meals                          Starbucks Purchase
Expense                                 DR Business Meals  ₹7,800
Balance ₹7,800 DR                       CR Corporate Card ₹7,800
                                        Balance: ₹7,800 DR
```

What shipped is a **table + drill-down wizard**:

```
Accounts table  →  full-page account ledger  →  full-page journal
```

That is usable and much better than journal cards. It is still one step short of the distinctive SUTRA Ledger. The empty space problem is improved, but the page still reads as “a dashboard with a table,” not “the books of the business.”

**Do not rebuild the kernel. Do a UI increment.**

---

## 3. Priority: do next

### P0 — Split-pane General Ledger (the remaining product beat)

Replace sequential drill-down with a persistent master–detail layout on desktop:

- **Left (~36–40%):** account list with type + current balance.
- **Right (~60–64%):** selected account’s ledger (date, journal, description, DR, CR, running balance).
- Empty right pane when nothing is selected: “Select an account to see its ledger.”
- Clicking a ledger line opens journal detail **in the right pane** (or a slide-over), not a third full-page route that throws away the account list.

Why this matters:

- It matches how accountants actually use a GL.
- It fills the page with *state + activity* at the same time.
- It makes the Engine → Ledger jump obvious: highlight the account on the left, show the new line on the right.

Keep the stacked drill-down on mobile (`max-width: 820px`).

### P0 — Engine should land on the affected account, not the index

Today, `JN-2026-000001 →` from the Engine result panel opens the Accounts index and briefly glows rows.

It should:

1. Open Ledger → Accounts.
2. Select **Business Meals** (first debit-normal impacted account, or both if we split-pane).
3. Scroll the new line into view on the right.
4. Keep a short glow on the balance and the new row.

The circular story is:

```
Event → Engine → Journal → Ledger (this account, this line) → View in Engine
```

Landing on a 10-row index breaks that sentence.

### P1 — Trial Balance rows should be accounts

Trial Balance is the best demo screen in the product. It currently dead-ends.

- Rows have `cursor: pointer` from shared table CSS but **do not navigate**.
- Clicking “Business Meals ₹10,200” should open that account’s ledger.
- This is a one-hour fix and makes Trial Balance a doorway, not a poster.

### P1 — Collapse the triple “Balanced” chrome

The Accounts landing currently says the books are balanced **three times**:

1. Stats row: `✓ Balanced`
2. Overview badge: `✓ Ledger Balanced`
3. Trial Balance pane: `✓ Debits = Credits`

Pick one hero confirmation and keep the others quiet.

Recommendation:

- Landing header: `10 Accounts · ₹92,600 DR · ₹92,600 CR`
- One badge: `Ledger balanced`
- Trial pane: totals row + `Debits = Credits` only, no second badge above the table

The overview (Assets / Liabilities / Expenses / Income) is the useful part. The repeated checkmarks feel like we are anxious the engine works.

### P1 — Journals tab is the leftover receipt list

Accounts and Trial Balance now look like a GL. Journals still looks like the old Ledger: stacked cards with merchant + DR/CR lines.

Make Journals a **table**, same visual language as Accounts:

| Date | Journal | Description | Rule | Debit | Credit | Status |
|---|---|---|---|---:|---:|---|
| Sep 6 | JN-2026-000001 | Starbucks | R110 | ₹7,800 | ₹7,800 | Posted |

Click row → journal detail with `View in Engine`.

Until this is done, switching to Journals is a visual regression inside Ledger.

### P1 — Replay is now redundant

Replay is “pick a posted journal and re-run the machine.” Journal detail already has **View in Engine**, and it does the same thing without double-posting.

Options:

- **A (preferred):** Remove Replay from top nav. Engine / Rules / Ledger is a tighter product. Replay lives as an action on a journal.
- **B:** Keep Replay, but make it a *library of posted events* with a play button, not a second journal list.

Do not leave two competing lists of the same journals.

---

## 4. Demo credibility (small, high leverage)

These are the things a finance person will notice in the first 30 seconds.

### Dates are all “today”

Engine events now use `new Date()`. Run Starbucks twice and both lines are “Sep 6”. The original mock needed:

```
Sep 5   JN-000001   Starbucks    7,800     —    7,800 DR
Sep 5   JN-000002   Starbucks    2,400     —   10,200 DR
Sep 6   JN-000003   Refund           —   800    9,400 DR
```

Running balance is much more convincing across dates. Options:

- Stamp example transactions with canned dates (Starbucks Sep 5, AWS Sep 5, refund Sep 6).
- Or: each process increments a demo clock by one day / a few hours.

Do **not** go back to a single hardcoded timestamp for every event. Just don’t collapse the story into one calendar day.

### Auto-run on load pollutes the books

On first page load, if `lastResult` is null, the client **automatically posts Starbucks**. The operator never sees a zero ledger, and the first “I clicked something” moment is already spent.

For a GL demo, zero state is valuable:

```
Cash                 —     —
Business Meals       —     —
Corporate Card       —     —
```

Then one click produces ₹7,800 DR / ₹7,800 CR.

Recommendation: do not auto-post. Show the Engine idle, Ledger at zero, Trial Balance empty. Let the first click be the mutation.

### Period is display-only

The original sketch had `Date: Sep 5 ▾`. We show `Sep 6 2026` (or a from–to range) as text. There is no as-of control.

For MVP we do not need a datepicker. We do need the *idea* of a reporting date:

- Label it `As of 6 Sep 2026`
- Optionally a stub control that is disabled / “Current” so it is clear this is a point-in-time snapshot, not “all journals forever with no period.”

`getTrialBalance({ asOf })` already exists in the kernel. The UI just doesn’t expose it.

### Currency filter is dead UI

Every engine account is INR. “All currencies ▾” is a dropdown with one real option. It makes the product look unfinished.

Hide the currency filter until `balances` contains more than one currency. Same for a currency column.

### Zero formatting is inconsistent

- Account table balance `0` → `—`
- Overview Assets `0` → `₹0`
- Trial Balance omits zero accounts entirely (correct)

Pick one rule:

- Movement columns (Debit / Credit): `—` when zero
- Balance: always show side (`₹0 DR`) so normal balance is visible
- Overview: `₹0 DR` / `₹0 CR`, not bare `₹0`

### Refund amounts fight the ledger

`rupee(amount, 'REFUND')` prefixes a minus on journal cards (`-₹5,000`). Ledger lines are unsigned DR/CR. A reviewer will ask “is this a negative expense or a debit to Customer Refunds?”

Show event amount unsigned in the GL. Keep the minus, if at all, only on the Engine example list where “refund” is a transaction type, not an account balance.

---

## 5. Engine ↔ Ledger join (don’t overdo it)

The new Result-panel impact cards are the right *idea* and currently the wrong *density*.

After a post, the Result column now contains:

1. Merchant
2. Matched rule + conditions
3. Journal DR/CR lines
4. Per-account previous → delta → next cards
5. Balanced DR = CR
6. Journal id link

That is three representations of the same two lines. On a 264px result column it overflows and the distinctive Engine machine is still the hero — the result rail becomes a stack of receipts.

**Keep impact. Compress it.**

At ACCOUNT MAPPING / POSTING, show one compact block:

```
Business Meals
₹0 DR  + ₹7,800 DR  →  ₹7,800 DR

Corporate Card
₹0 CR  + ₹7,800 CR  →  ₹7,800 CR
```

One line per account, then `JN-2026-000001 → Ledger`. Drop the duplicate journal line list *or* the impact cards, not neither.

Do **not** put this animation into the Engine machine chambers. The machine is already visually dense; mutating balances there will fight the particle/chamber story.

The Engine page should *point at* Ledger state. Ledger should *be* the state.

---

## 6. Interaction and craft nits

Worth doing once P0/P1 are in. Not worth a separate epic.

| Issue | Why |
|---|---|
| Table rows are clickable `<tr>`s, not buttons/links | No keyboard access, no focus ring, no Enter/Space |
| Trial rows look clickable and aren’t | Broken affordance |
| Account-ledger back is `← Ledger`, journal-detail back is also `← Ledger` | Should be breadcrumb: `Ledger / Business Meals / JN-2026-000001` |
| Glow is a 1.4s box-shadow, then gone | If the user is still on Engine, they miss it. Persist a “just posted” marker until next post |
| Filters have no empty state | Search “xyz” blanks the table with no message |
| Sticky header on tables | Running-balance tables need frozen column headers when they scroll |
| No sort | Default by account code is correct; optional click-to-sort on Balance would help a 10-row chart |
| Overview omits Equity | Fine for this COA (no equity accounts). If a 3000-range account appears later, it will be invisible in the overview |
| Journal detail cannot click through to an *account* | You can go journal → engine, but not journal line → Business Meals |
| Department field on Engine form does nothing | Dead control; remove or wire as an event attribute |
| Rules full-page and Engine-embedded Rules are duplicates | Acceptable for now; don’t expand Rules until Ledger is the stronger sibling |

---

## 7. What I would not do

These will make the UI look busier without making SUTRA clearer.

- A P&L, Balance Sheet, or “reports” module
- Editable balances, journal reversal UI, or period close
- Multi-currency FX
- Charts / sparklines of account balances
- Animating every number with count-up
- Putting balance math back into React
- Storing balance on `Account`
- Visual redesign of the Engine machine
- A second design language for Ledger (keep the existing dark industrial tokens)

The product win is still:

> This is not an AI that spits out entries. There is a real double-entry engine, and it has state.

Trial Balance + running balances already say that. The split pane and the Engine→account landing make people *feel* it.

---

## 8. Suggested next increment (one PR)

Call it **L4 — Split-pane GL + join polish**. Do not mix with Engine restyling.

1. Desktop Ledger = account list \| account activity.
2. Engine journal link selects the impacted account and the new line.
3. Trial Balance rows navigate to that account.
4. Journals becomes a table; Replay drops out of top nav (or becomes the journal action only).
5. Stop auto-posting Starbucks on first load.
6. Collapse duplicate “Balanced” badges.
7. Hide currency filter when there is only INR.
8. Compress Engine impact into one line per account.

That’s enough. After L4, Ledger will be as distinctive as Engine, and Rules can stay a configuration table.

---

## 9. Review questions for a second model

If you are ChatGPT (or another reviewer), please answer these explicitly:

1. Is split-pane master–detail the right Ledger landing, or is table + drill-down enough for an MVP demo?
2. Should Replay remain a top-level nav item once journals have “View in Engine”?
3. Should first-load auto-post stay, because a pre-filled ledger is a better screenshot than zeros?
4. Is the Engine result-panel impact useful, or does it steal attention from the machine?
5. Anything in §7 (“do not do”) that is actually worth doing *now* for fundraising / first-user demos?

Please challenge P0 if you think the current table is already the right density. The risk of L4 is turning Ledger into an accounting workstation. The risk of stopping here is that Engine still feels like the product and Ledger still feels like a supporting page.
