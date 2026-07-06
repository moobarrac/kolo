// Default categories seeded for new users (and offered as a one-tap setup for
// existing ones). A wide, everyday set so "Money out" works out of the box.
// These are ordinary income/expense accounts (§4.1) — the user can add/rename freely.

export const DEFAULT_EXPENSE_CATEGORIES = [
  "Rent",
  "Groceries",
  "Utilities",
  "Transport",
  "Fuel",
  "Eating out",
  "Airtime & data",
  "Health",
  "Education",
  "Entertainment",
  "Shopping",
  "Personal care",
  "Subscriptions",
  "Family & gifts",
  "Savings",
  "Insurance",
  "Repairs & maintenance",
  "Fees & charges",
  "Donations",
  "Other",
] as const;

export const DEFAULT_INCOME_SOURCES = [
  "Salary",
  "Business",
  "Freelance",
  "Investments",
  "Rent received",
  "Gifts",
  "Other",
] as const;
