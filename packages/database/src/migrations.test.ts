import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REQUIRED_MIGRATIONS } from "./migrations-manifest";

const dir = path.resolve(import.meta.dirname, "../prisma/migrations");
const folders = readdirSync(dir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

describe("migration manifest", () => {
  it("lists exactly the migration folders, in order", () => {
    expect([...REQUIRED_MIGRATIONS]).toEqual(folders);
  });
});

/**
 * Releases deploy web, worker and the migration job concurrently, and the previous release keeps
 * running until the new one is healthy. Migrations must therefore be backward compatible
 * ("expand" only). Destructive statements need an explicit, reviewed opt-out marker and belong in
 * a later "contract" release, after no running code depends on the old schema.
 */
const DESTRUCTIVE = [
  /\bDROP\s+(TABLE|COLUMN|SCHEMA|TYPE|INDEX)\b/i,
  /\bALTER\s+TABLE\b[\s\S]*?\bRENAME\b/i,
  /\bALTER\s+COLUMN\b[\s\S]*?\bTYPE\b/i,
  /\bALTER\s+COLUMN\b[\s\S]*?\bSET\s+NOT\s+NULL\b/i,
  /\bTRUNCATE\b/i,
  /\bDELETE\s+FROM\b/i,
];
const OPT_OUT = "-- uptimekit:allow-destructive";

describe("migration safety", () => {
  it.each(folders)("%s is backward compatible (or explicitly marked)", (folder) => {
    const sql = readFileSync(path.join(dir, folder, "migration.sql"), "utf8");
    if (sql.includes(OPT_OUT)) return;
    const withoutComments = sql.replace(/--.*$/gm, "");
    for (const pattern of DESTRUCTIVE) {
      expect(withoutComments, `${folder} matches ${pattern}`).not.toMatch(pattern);
    }
  });
});
