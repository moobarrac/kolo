// @kolo/shared — single source of truth for money, domain types, the
// entry-kind->legs map (§8) and validation schemas. Imported by both
// frontend/ and backend/; neither redefines these. [INVARIANT §2.5]

export * from "./currencies.js";
export * from "./money.js";
export * from "./types.js";
export * from "./legs.js";
export * from "./schemas.js";
