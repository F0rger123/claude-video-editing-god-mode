import { describe, expect, it } from "vitest";
import { findMyDrive, parseRobocopySummary, robocopyArgs, robocopyOk } from "./backup.mjs";

describe("Drive backup", () => {
  it("finds My Drive on whichever letter Drive mounted", () => {
    expect(findMyDrive((p) => p === String.raw`H:\My Drive`)).toBe(String.raw`H:\My Drive`);
    expect(findMyDrive(() => false)).toBeNull();
  });
  it("copies without deleting anything from the backup", () => {
    const args = robocopyArgs("C:\src", "G:\My Drive\God Mode Cut backup", "C:\log.txt");
    expect(args).toContain("/E");
    expect(args).not.toContain("/MIR");
    expect(args).not.toContain("/PURGE");
    expect(args).toContain("*.part");
  });
  it("treats robocopy 0-7 as success and 8+ as failure", () => {
    expect([0, 1, 3, 7].every(robocopyOk)).toBe(true);
    expect(robocopyOk(8)).toBe(false);
    expect(robocopyOk(16)).toBe(false);
    expect(robocopyOk(NaN)).toBe(false);
  });
  it("reads the totals from robocopy's summary", () => {
    const text = `
               Total    Copied   Skipped  Mismatch    FAILED    Extras
    Dirs :        12         2        10         0         0         0
   Files :       240        15       225         0         1         0
   Bytes : 9876543210  12345678 9864197532         0      1000         0
`;
    const s = parseRobocopySummary(text);
    expect(s.files).toEqual({ total: 240, copied: 15, skipped: 225, failed: 1 });
    expect(s.bytes.total).toBe(9876543210);
  });
});
