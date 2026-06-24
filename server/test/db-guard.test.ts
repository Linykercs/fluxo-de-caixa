import { describe, expect, it } from "vitest";
import { assertDbWipeAllowed } from "../src/lib/db-guard";

describe("assertDbWipeAllowed", () => {
  it("lança quando NODE_ENV=production e ALLOW_DB_WIPE ausente", () => {
    const origEnv = process.env.NODE_ENV;
    const origWipe = process.env.ALLOW_DB_WIPE;
    process.env.NODE_ENV = "production";
    delete process.env.ALLOW_DB_WIPE;
    try {
      expect(() => assertDbWipeAllowed()).toThrow();
    } finally {
      process.env.NODE_ENV = origEnv;
      if (origWipe !== undefined) process.env.ALLOW_DB_WIPE = origWipe;
    }
  });

  it("não lança quando NODE_ENV=production e ALLOW_DB_WIPE=true", () => {
    const origEnv = process.env.NODE_ENV;
    const origWipe = process.env.ALLOW_DB_WIPE;
    process.env.NODE_ENV = "production";
    process.env.ALLOW_DB_WIPE = "true";
    try {
      expect(() => assertDbWipeAllowed()).not.toThrow();
    } finally {
      process.env.NODE_ENV = origEnv;
      if (origWipe !== undefined) process.env.ALLOW_DB_WIPE = origWipe;
      else delete process.env.ALLOW_DB_WIPE;
    }
  });

  it("não lança quando NODE_ENV diferente de production", () => {
    const origEnv = process.env.NODE_ENV;
    const origWipe = process.env.ALLOW_DB_WIPE;
    process.env.NODE_ENV = "development";
    delete process.env.ALLOW_DB_WIPE;
    try {
      expect(() => assertDbWipeAllowed()).not.toThrow();
    } finally {
      process.env.NODE_ENV = origEnv;
      if (origWipe !== undefined) process.env.ALLOW_DB_WIPE = origWipe;
    }
  });
});
