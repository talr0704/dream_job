import { expect, it, vi } from "vitest";
import { z } from "zod";
import {
  extractResponseSchema,
  professionalProfileSchema,
  extractionCandidateSchema,
} from "../../shared/contracts";
import { parseExtractedProfile } from "../../worker/extraction";
import {
  extractionSchema,
  structuredSchema,
  assertStructuredSchema,
} from "../../worker/ai";
import { createWorker } from "../../worker/index";
import { DreamJobClient } from "../../src/lib/api";
import { DreamJobDB } from "../../src/lib/storage";
import { profile, env, identity, mockAI } from "./fixtures";
const omitted = Symbol("omitted");
function link(id: number, url: unknown) {
  const result: any = { id: `project-link-${id}`, label: `Resource ${id}` };
  if (url !== omitted) result.url = url;
  return result;
}
function draft(links: unknown[] = []) {
  return {
    profile: {
      ...structuredClone(profile),
      verified: false,
      projects: [
        {
          id: "project-1",
          name: "Private synthetic project",
          description:
            "Built a TypeScript and React tool with accessible keyboard navigation.",
          achievements: [
            {
              id: "project-achievement-1",
              text: "Delivered 3 integrations.",
              provenance: {
                source: "document" as const,
                quote: "Delivered 3 integrations.",
              },
            },
          ],
          links,
          provenance: {
            source: "document" as const,
            quote: "Built a TypeScript and React tool.",
          },
        },
      ],
    },
    warnings: [] as string[],
  };
}
const invalid = [
  omitted,
  null,
  "",
  "   ",
  "N/A",
  "not provided",
  "private-invalid-url",
  "site.test/project",
  "http://site.test/project",
  "ftp://site.test/project",
  "mailto:private@site.test",
  "javascript:alert(1)",
  "https://user:secret@site.test/project",
  "https://localhost/project",
  "https://127.0.0.1/project",
  "https://example.com/project",
  "https://placeholder.invalid/project",
  "https://site.test/{username}",
  "https://site.test/your-url",
  123,
  {},
  [],
  "https://site.test/" + "a".repeat(2100),
];
it("reproduces ten URL issues from five malformed project link candidates", () => {
  const raw = draft(Array.from({ length: 5 }, (_, i) => link(i, "N/A")));
  const before = professionalProfileSchema.safeParse(raw.profile);
  expect(before.success).toBe(false);
  if (!before.success) {
    expect(before.error.issues).toHaveLength(10);
    expect(before.error.issues.map((i) => i.code)).toEqual(
      Array(5).fill(["invalid_format", "custom"]).flat(),
    );
    expect(
      before.error.issues.every((i) =>
        i.path.join(".").match(/^projects\.0\.links\.[0-4]\.url$/),
      ),
    ).toBe(true);
  }
  const result = parseExtractedProfile(raw);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.profile.projects).toEqual(draft().profile.projects);
    expect(result.data.warnings).toHaveLength(1);
    expect(result.data.warnings[0]).toMatch(/^Project 1:/);
  }
});
it.each(invalid.map((value, index) => ({ value, index })))(
  "removes only the invalid URL candidate, case $index",
  ({ value }) => {
    const raw = draft([link(1, value)]);
    const before = structuredClone(raw);
    const result = parseExtractedProfile(raw);
    expect(result.success).toBe(true);
    if (result.success)
      expect(result.data.profile.projects).toEqual(draft().profile.projects);
    expect(raw).toEqual(before);
  },
);
it("preserves valid labels, URLs, order and every project fact in mixed arrays", () => {
  const valid = [
    {
      ...link(1, "https://GitHub.com/alex/Repo?tab=readme#Overview"),
      label: "  Source code  ",
    },
    {
      ...link(3, "https://project.test:443/%E2%9C%93?tags[]=React"),
      label: "Live project & documentation",
    },
  ];
  const raw = draft([valid[0], link(2, "N/A"), valid[1], link(4, null)]);
  const result = parseExtractedProfile(raw);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.profile.projects).toEqual(draft(valid).profile.projects);
    expect(result.data.profile.skills).toEqual(profile.skills);
    expect(result.data.profile.experience).toEqual(profile.experience);
    expect(result.data.profile.verified).toBe(false);
    expect(extractResponseSchema.parse(result.data)).toEqual(result.data);
  }
});
it("leaves projects without link candidates unchanged and without removal warnings", () => {
  const raw = draft();
  expect(parseExtractedProfile(raw)).toEqual({ success: true, data: raw });
  const none = { ...raw, profile: { ...raw.profile, projects: [] } };
  expect(parseExtractedProfile(none)).toEqual({ success: true, data: none });
});
it("validates non-URL facts, link metadata, duplicate IDs and original bounds before discarding", () => {
  const changes: ((r: any) => void)[] = [
    (r) => {
      r.profile.projects[0].links[0].id = "";
    },
    (r) => {
      r.profile.projects[0].links[0].id = "skill-1";
    },
    (r) => {
      r.profile.projects[0].links.push(link(1, "also-invalid"));
    },
    (r) => {
      r.profile.projects[0].links[0].label = "   ";
    },
    (r) => {
      r.profile.projects[0].links[0].label = 123;
    },
    (r) => {
      r.profile.projects[0].links[0].label = "a".repeat(3001);
    },
    (r) => {
      r.profile.projects[0].links[0].unknown = true;
    },
    (r) => {
      r.profile.projects[0].links = [null];
    },
    (r) => {
      r.profile.projects[0].links = "not an array";
    },
    (r) => {
      delete r.profile.projects[0].links;
    },
    (r) => {
      r.profile.projects[0].links = Array.from({ length: 11 }, (_, i) =>
        link(i, "N/A"),
      );
    },
    (r) => {
      r.profile.projects[0].description = 123;
    },
    (r) => {
      r.profile.projects[0].achievements[0].text = "";
    },
    (r) => {
      r.profile.projects[0].provenance.source = "invented";
    },
    (r) => {
      r.profile.personal.email = "invalid";
    },
    (r) => {
      r.profile.verified = true;
    },
    (r) => {
      r.profile.links = [{ ...link(8, "N/A"), label: "" }];
    },
    (r) => {
      r.warnings = [""];
    },
    (r) => {
      r.warnings = Array(51).fill("Review");
    },
  ];
  for (const change of changes) {
    const raw = draft([link(1, "N/A")]);
    change(raw);
    const before = structuredClone(raw);
    expect(parseExtractedProfile(raw).success).toBe(false);
    expect(raw).toEqual(before);
  }
});
it("keeps canonical saved-profile and final/client project URLs strict", () => {
  for (const url of [null, "N/A", "http://site.test/project", omitted]) {
    const raw = draft([link(1, url)]);
    expect(professionalProfileSchema.safeParse(raw.profile).success).toBe(
      false,
    );
    expect(extractResponseSchema.safeParse(raw).success).toBe(false);
  }
});
it("generates the supported candidate contract while the final response keeps URLs required", () => {
  const provider: any = structuredSchema(extractionSchema);
  assertStructuredSchema(provider);
  const item =
    provider.properties.profile.properties.projects.items.properties.links
      .items;
  expect(item.required).toEqual(expect.arrayContaining(["id", "label", "url"]));
  expect(item.additionalProperties).toBe(false);
  expect(JSON.stringify(item.properties.url)).toContain("null");
  expect(item.properties.url.description).toContain(
    "Never infer, repair or fabricate",
  );
  const response: any = z.toJSONSchema(extractResponseSchema, { io: "input" });
  const url =
    response.properties.profile.properties.projects.items.properties.links.items
      .properties.url;
  expect(url.type).toBe("string");
  expect(JSON.stringify(url)).not.toContain('"null"');
  expect(
    extractionCandidateSchema.safeParse(draft([link(1, null)])).success,
  ).toBe(true);
});
it("audits the remaining URL collections: only project links are optional nested collections", () => {
  const schema: any = z.toJSONSchema(professionalProfileSchema, {
    io: "input",
  });
  const paths: string[] = [];
  function walk(node: any, path: string) {
    if (node.format === "uri") paths.push(path);
    for (const [key, child] of Object.entries(node.properties || {}))
      walk(child, path ? path + "." + key : key);
    if (node.items) walk(node.items, path + "[]");
    for (const child of node.anyOf || []) walk(child, path);
  }
  walk(schema, "");
  expect(paths.sort()).toEqual(
    [
      "personal.linkedin",
      "personal.portfolio",
      "personal.github",
      "certifications[].url",
      "links[].url",
      "projects[].links[].url",
    ].sort(),
  );
});
it("returns project-index warnings for every affected project within limits and changes no saved data", async () => {
  const db = new DreamJobDB("project-links-" + crypto.randomUUID());
  try {
    await db.approveProfile(profile, true);
    const before = await db.professionalProfiles.toArray();
    const raw = draft([link(1, "private-invalid-url-marker")]);
    raw.profile.projects = Array.from({ length: 10 }, (_, index) => ({
      ...structuredClone(raw.profile.projects[0]),
      id: `project-${index}`,
      achievements: [],
      links: [
        {
          id: `link-${index}`,
          label: "Private label",
          url: "private-invalid-url-marker",
        },
      ],
    }));
    raw.warnings = Array.from({ length: 50 }, (_, i) => `Review ${i}`);
    const log = vi.fn();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(mockAI(raw))
      .mockResolvedValueOnce(mockAI({ supported: true, reasons: [] }));
    const w = createWorker({ authenticate: identity, fetcher, log });
    const client = new DreamJobClient("https://api.test", async (url, init) =>
      w.fetch(new Request(url, init), env),
    );
    const result = await client.extractProfile({
      text: "Synthetic project facts containing TypeScript, React and keyboard navigation for review.",
    });
    expect(result.profile.verified).toBe(false);
    expect(result.profile.projects.every((p) => p.links.length === 0)).toBe(
      true,
    );
    expect(result.warnings).toHaveLength(50);
    for (let index = 1; index <= 10; index++)
      expect(
        result.warnings.some((w) => w.startsWith(`Project ${index}:`)),
      ).toBe(true);
    expect(result.warnings.join(" ")).not.toContain("Private");
    expect(result.warnings.join(" ")).not.toContain(
      "private-invalid-url-marker",
    );
    const first = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(first.messages[0].content).toContain(
      "Preserve valid project links with their exact supplied labels and URLs",
    );
    const audit = JSON.parse(
      JSON.parse(fetcher.mock.calls[1][1].body).messages[1].content,
    );
    expect(audit.output.profile.projects).toEqual(result.profile.projects);
    expect(await db.professionalProfiles.toArray()).toEqual(before);
    expect(await db.profileVersions.count()).toBe(1);
    expect(log).not.toHaveBeenCalled();
  } finally {
    await db.delete();
  }
});
it("still rejects unsupported project facts in the independent factuality audit", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(mockAI(draft([link(1, "N/A")])))
    .mockResolvedValueOnce(
      mockAI({ supported: false, reasons: ["Unsupported accomplishment"] }),
    );
  const log = vi.fn();
  const worker = createWorker({ authenticate: identity, fetcher, log });
  const response = await worker.fetch(
    new Request("https://api.test/api/extract-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "Synthetic professional facts requiring an independent audit.",
      }),
    }),
    env,
  );
  expect(response.status).toBe(422);
  expect(((await response.json()) as any).error.code).toBe("UNSUPPORTED_CLAIM");
  expect(JSON.stringify(log.mock.calls)).not.toContain(
    "Private synthetic project",
  );
  expect(JSON.stringify(log.mock.calls)).not.toContain(
    "Delivered 3 integrations",
  );
});
