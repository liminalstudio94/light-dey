import { describe, expect, it } from "vitest";
import { AREAS, searchAreas } from "@/lib/areas";

describe("searchAreas", () => {
  it.each(["Lekki", "Ajah", "Ikeja", "Yaba", "Surulere", "Victoria Island", "Ikoyi", "Festac", "Agege", "Lagos Island"])("finds %s", (q) => {
    expect(searchAreas(q)[0]?.name.toLowerCase()).toContain(q.toLowerCase());
  });
  it("matches prefixes and aliases", () => {
    expect(searchAreas("sur")[0].id).toBe("surulere");
    expect(searchAreas("vi")[0].id).toBe("victoria-island");
  });
  it("returns nothing for empty or unmatched queries", () => {
    expect(searchAreas("")).toEqual([]);
    expect(searchAreas("zzzz")).toEqual([]);
  });
  it("area ids are unique slugs", () => {
    const ids = AREAS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^[a-z0-9-]+$/.test(id))).toBe(true);
  });
});
