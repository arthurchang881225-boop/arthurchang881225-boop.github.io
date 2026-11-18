# Site data

The Credit Card Bonus page (`credit-card-bonus.html`), the Bank Account Bonus page
(`bank-account-bonus.html`) and the Referrals page (`referrals.html`) contain no
offer content of their own. Their scripts in `js/` read
these files and draw everything. To update a page, change its data and leave the
HTML, CSS and JS alone.

| File | Who changes it | Used by |
|---|---|---|
| `cards.json` | Weekly offer check (replaced each run) | Credit Card Bonus, Referrals, Home (bonus gallery) |
| `transfers.json` | Weekly offer check (replaced each run) | Credit Card Bonus |
| `banks.json` | Weekly bank bonus check (replaced each run). Nationwide offers only | Bank Account Bonus |
| `referrals.json` | Arthur, by hand. The weekly check never edits it | Credit Card Bonus, Bank Account Bonus, Referrals |

Preview locally with a small web server. Pages opened straight from the file system
can't load JSON. The site links to clean addresses such as `/about`, which GitHub
Pages maps to `about.html`; `serve` does the same locally:

```bash
npx serve
```

## cards.json

```jsonc
{
  "updated": "2026-11-14",          // date the offers were checked (YYYY-MM-DD); not shown on the page
  "cards": [ /* one object per card, below */ ]
}
```

Each card:

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Stable snake_case id. Never rename it: referrals and images match on it |
| `segment` | `"personal"` or `"business"` | Which toggle tab shows the card |
| `card`, `short` | string | Full name and short name (charts, checkboxes) |
| `issuer`, `program`, `kind` | string | Bank, rewards currency, for example "Transferable points" |
| `url` | string | The card's own application page, which must show this offer (not a general list of cards) |
| `image` | string | `images/cards/<id>.jpg` or `.png`, or `""` to show a placeholder |
| `bonus_points` | number | Current public welcome bonus |
| `as_high_as` | boolean | Offer is "as high as" (Amex personalized offers) |
| `bonus_extra` | string | Extra terms, or `""` |
| `spend`, `months` | number | Minimum spend and the months to reach it |
| `ends` | string | Offer end date `YYYY-MM-DD`, or `""` |
| `best_ever`, `best_note` | number, string | Best public bonus before today, with a short note |
| `annual_fee` | number | The regular yearly fee in dollars (also for cards whose first year is free) |
| `first_year_fee` | number | What the first year costs. Equal to `annual_fee` unless the first year is waived or reduced; the page then crosses out the regular fee |
| `fee_note` | string | Only extra fee facts, such as "$249 per authorized user", or `""`. Never "Not waived", "No annual fee" or the first-year waiver, which the page shows itself |
| `cpp` | number | Cents per point used for the estimated value |
| `rule_family` | string | Groups cards that share a bonus rule (for example `ihg_personal`) |
| `amex_credit`, `chase_524`, `barclays` | boolean | Card counts toward the Amex 5-card limit (kept for reference; the checker doesn't ask about it), is subject to Chase 5/24, or is a Barclays card |
| `verified` | string | Where and when the offer was checked (for the weekly check; not shown on the page) |
| `history` | array of `{ "month": "YYYY-MM", "points": number }` | Past offers, oldest first. Two or more entries draw the sparkline |
| `history_source` | string | Where the history came from (not shown on the page) |
| `earn` | array of `{ "rate": "5x", "what": "…" }` | Earning rates, one entry per category. The page puts categories with the same `rate` on one row, highest rate first |
| `credits` | array of `{ "label", "value", "annual": number }` | Statement credits, largest first. `value` is the wording ("$25 a month"); `annual` is the yearly dollar value, or 0 when it can't be counted per year (per stay, after a spend threshold). The page adds up `annual` as the yearly total |
| `highlights` | array of `{ "label", "value" }` | Other perks: lounges, status, free nights, certificates. `value` is a short note or `""` |

A card is a record-high offer when `bonus_points >= best_ever`.

The home page gallery reads `segment`, `short`, `issuer`, `image`, `bonus_points`,
`as_high_as`, `best_ever` and `cpp`, so keep those on every card.

## transfers.json

```jsonc
{
  "updated": "2026-11-14",
  "note": "…",                      // shown under the transfer table
  "transfers": [
    {
      "id": "chase_ihg",
      "program": "Chase Ultimate Rewards",
      "partner": "IHG One Rewards",
      "bonus_pct": 80,
      "base_ratio": 1,              // the page assumes 1:1; say any other ratio in "note"
      "ends": "2026-12-03",
      "note": "When it is worth it…",
      "sweet_spot": "…",            // "" to leave it out of the sweet spots grid
      "partner_points": 40000       // award price in partner points, 0 if none
    }
  ]
}
```

Bonuses whose `ends` date has passed are hidden automatically.

## banks.json

```jsonc
{
  "updated": "2026-11-17",          // date the offers were checked; not shown on the page
  "accounts": [ /* one object per account, below */ ]
}
```

Each account:

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Stable snake_case id. Referral links match on it |
| `segment` | `"personal"` or `"business"` | Which toggle tab shows the account |
| `type` | `"checking"` or `"savings"` | The Checking / Savings filter (shown when a tab has both) |
| `bank`, `account`, `short` | string | Bank name, full account name, short name for the chart |
| `logo` | string | `images/banks/<bank>.png` or `.svg`, the bank's square logo (shown on a white tile). Every bank needs one |
| `url` | string | The bank's own offer page, which must show this bonus |
| `referral_only` | boolean | The bonus only comes through a referral link; `url` is then the account's page |
| `requirement` | `"direct_deposit"` or `"deposit"` | Direct deposits within `days`, or a deposit kept in the account |
| `tiers` | array of `{ "need": number, "bonus": number }` | Dollars needed and the cash bonus, one per tier. For points, `bonus` is the estimated dollar value |
| `points`, `program`, `cpp` | number, string, number | Points bonuses only (else 0, "", 0): points, rewards program, cents per point |
| `days` | number | Days to complete the requirement |
| `hold_days` | number | Days the money stays in the account if deposited right away (0 for direct deposit). Used for the "like X% a year" figure |
| `steps` | array of string | How to earn it, in order |
| `monthly_fee`, `fee_waiver` | number, string | Monthly fee (0 for none) and how to avoid it |
| `ends` | string | Offer end date `YYYY-MM-DD`, or `""` |
| `rule_short`, `eligibility` | string | Who can get the bonus: a short chip text and the full sentence |
| `payout` | string | When the bonus is paid |
| `notes` | array of string | Other facts worth knowing, or `[]` |
| `verified` | string | Where and when the offer was checked (not shown on the page) |

The checker works out the tier a visitor can reach: monthly direct deposit times
`days / 30`, or the cash they could deposit.

## referrals.json

`groups` become the sections of the Referrals page, in order. A group with no
`items` is hidden, so `bank-accounts` stays hidden until you add one.

Each item:

| Field | Meaning |
|---|---|
| `id` | Unique id for the entry |
| `name`, `issuer`, `note` | Shown on the Referrals page |
| `image` | Card art path in `images/cards/`, or `""` for a placeholder |
| `logo` | Bank accounts only (optional): a logo in `images/banks/`, shown when there is no `image` |
| `url` | Your referral link, exactly as the bank gave it |
| `card_ids` | Ids from `cards.json` this link covers. When one of them appears on the Credit Card Bonus page, its Apply button uses this link. Use `[]` for bank accounts |
| `account_ids` | Bank accounts only: ids from `banks.json` this link covers, used by the Bank Account Bonus page's Open button |
