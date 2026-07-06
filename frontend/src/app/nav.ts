import {
  Home,
  ArrowRightLeft,
  Landmark,
  CreditCard,
  HandCoins,
  Repeat,
  Target,
  Wallet,
  ChartColumn,
  ListChecks,
  Settings,
  type LucideIcon,
} from "lucide-react";

// Single source for the app's routes + navigation (§13.1). The router, the
// desktop sidebar, and the mobile bottom bar all read from this list, so adding
// a view is a one-line change. Labels are plain English — no ledger jargon.
export interface NavItem {
  /** route path */
  path: string;
  /** label shown in navigation */
  label: string;
  /** shorter label for the tight mobile bar (falls back to label) */
  short?: string;
  /** show as a primary tab in the mobile bottom bar (rest live under "More") */
  primary?: boolean;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { path: "/", label: "Overview", icon: Home, primary: true },
  { path: "/money", label: "Money in & out", short: "Money", icon: ArrowRightLeft, primary: true },
  { path: "/things-i-own", label: "Things I own", icon: Landmark },
  { path: "/what-i-owe", label: "What I owe", icon: CreditCard },
  { path: "/owed-to-me", label: "Owed to me", icon: HandCoins },
  { path: "/recurring", label: "Recurring", icon: Repeat },
  { path: "/goals", label: "Goals", icon: Target },
  { path: "/budgets", label: "Budgets", icon: Wallet, primary: true },
  { path: "/reports", label: "Reports", icon: ChartColumn, primary: true },
  { path: "/reconcile", label: "Statement check", icon: ListChecks },
  { path: "/settings", label: "Settings", icon: Settings },
];
