import { describe, it, expect } from "vitest";
import { parsePromptData, _internal } from "./pngReader.js";

const { parseTagWeight, expandControlSyntax, extractWeightedTags } = _internal;

describe("parseTagWeight", () => {
  it("should parse normal tag with default weight", () => {
    const result = parseTagWeight("1girl");
    expect(result).toEqual({
      tagName: "1girl",
      weight: 1.0,
      isNegative: false,
    });
  });

  it("should parse tag with spaces and normalize to underscores", () => {
    const result = parseTagWeight("red eyes");
    expect(result).toEqual({
      tagName: "red_eyes",
      weight: 1.0,
      isNegative: false,
    });
  });

  it("should parse single curly brace emphasis {tag}", () => {
    const result = parseTagWeight("{emphasis}");
    expect(result).toEqual({
      tagName: "emphasis",
      weight: 1.05,
      isNegative: false,
    });
  });

  it("should parse double curly brace emphasis {{tag}}", () => {
    const result = parseTagWeight("{{strong}}");
    expect(result).toEqual({
      tagName: "strong",
      weight: 1.05 * 1.05,
      isNegative: false,
    });
  });

  it("should parse triple curly brace emphasis {{{tag}}}", () => {
    const result = parseTagWeight("{{{very strong}}}");
    expect(result).toEqual({
      tagName: "very_strong",
      weight: Math.pow(1.05, 3),
      isNegative: false,
    });
  });

  it("should parse single square bracket de-emphasis [tag]", () => {
    const result = parseTagWeight("[weak]");
    expect(result).toEqual({
      tagName: "weak",
      weight: 0.95,
      isNegative: false,
    });
  });

  it("should parse double square bracket de-emphasis [[tag]]", () => {
    const result = parseTagWeight("[[weaker]]");
    expect(result).toEqual({
      tagName: "weaker",
      weight: 0.95 * 0.95,
      isNegative: false,
    });
  });

  it("should parse explicit positive weight N::tag::", () => {
    const result = parseTagWeight("1.2::custom weight::");
    expect(result).toEqual({
      tagName: "custom_weight",
      weight: 1.2,
      isNegative: false,
    });
  });

  it("should parse explicit negative weight -N::tag::", () => {
    const result = parseTagWeight("-1::negative tag::");
    expect(result).toEqual({
      tagName: "negative_tag",
      weight: 1.0,
      isNegative: true,
    });
  });

  it("should parse explicit negative weight with decimal -N.N::tag::", () => {
    const result = parseTagWeight("-0.5::half negative::");
    expect(result).toEqual({
      tagName: "half_negative",
      weight: 0.5,
      isNegative: true,
    });
  });

  it("should return null for empty string", () => {
    expect(parseTagWeight("")).toBeNull();
    expect(parseTagWeight("   ")).toBeNull();
  });

  it("should return null for numbers only", () => {
    expect(parseTagWeight("123")).toBeNull();
    expect(parseTagWeight("1.5")).toBeNull();
  });
});

describe("expandControlSyntax", () => {
  it("should expand -N::tag1, tag2:: to individual tags", () => {
    const result = expandControlSyntax("-1::tag1, tag2::");
    expect(result).toBe("-1::tag1::, -1::tag2::");
  });

  it("should expand N::tag1, tag2:: to individual tags", () => {
    const result = expandControlSyntax("1.5::emphasis1, emphasis2::");
    expect(result).toBe("1.5::emphasis1::, 1.5::emphasis2::");
  });

  it("should expand [[tag1, tag2]] to [[tag1]], [[tag2]]", () => {
    const result = expandControlSyntax("[[tag1, tag2]]");
    expect(result).toBe("[[tag1]], [[tag2]]");
  });

  it("should expand {{tag1, tag2}} to {{tag1}}, {{tag2}}", () => {
    const result = expandControlSyntax("{{tag1, tag2}}");
    expect(result).toBe("{{tag1}}, {{tag2}}");
  });

  it("should expand {{{tag1, tag2}}} to {{{tag1}}}, {{{tag2}}}", () => {
    const result = expandControlSyntax("{{{tag1, tag2}}}");
    expect(result).toBe("{{{tag1}}}, {{{tag2}}}");
  });

  it("should not expand single bracket without comma", () => {
    const result = expandControlSyntax("[[single tag]]");
    expect(result).toBe("[[single tag]]");
  });

  it("should handle mixed syntax", () => {
    const result = expandControlSyntax("normal, [[weak1, weak2]], {{strong}}");
    expect(result).toBe("normal, [[weak1]], [[weak2]], {{strong}}");
  });

  it("should handle complex prompt with multiple expansions", () => {
    const result = expandControlSyntax("-1::neg1, neg2::, [[de1, de2]], {{{em1, em2}}}");
    expect(result).toBe("-1::neg1::, -1::neg2::, [[de1]], [[de2]], {{{em1}}}, {{{em2}}}");
  });
});

describe("extractWeightedTags", () => {
  it("should extract simple tags", () => {
    const result = extractWeightedTags("1girl, red eyes, blue hair", "prompt");
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      name: "1girl",
      weight: 1.0,
      isNegative: false,
      source: "prompt",
    });
    expect(result[1]).toEqual({
      name: "red_eyes",
      weight: 1.0,
      isNegative: false,
      source: "prompt",
    });
  });

  it("should extract tags with curly brace weights", () => {
    const result = extractWeightedTags("{emphasis}, {{strong}}", "prompt");
    expect(result).toHaveLength(2);
    expect(result[0].weight).toBeCloseTo(1.05);
    expect(result[1].weight).toBeCloseTo(1.1025);
  });

  it("should extract tags with square bracket weights", () => {
    const result = extractWeightedTags("[weak], [[weaker]]", "prompt");
    expect(result).toHaveLength(2);
    expect(result[0].weight).toBeCloseTo(0.95);
    expect(result[1].weight).toBeCloseTo(0.9025);
  });

  it("should expand and extract [[tag1, tag2]] syntax", () => {
    const result = extractWeightedTags("[[red eyes, blue hair]]", "prompt");
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      name: "red_eyes",
      weight: 0.95 * 0.95,
      isNegative: false,
      source: "prompt",
    });
    expect(result[1]).toEqual({
      name: "blue_hair",
      weight: 0.95 * 0.95,
      isNegative: false,
      source: "prompt",
    });
  });

  it("should expand and extract {{{tag1, tag2}}} syntax", () => {
    const result = extractWeightedTags("{{{strong1, strong2}}}", "prompt");
    expect(result).toHaveLength(2);
    expect(result[0].weight).toBeCloseTo(Math.pow(1.05, 3));
    expect(result[1].weight).toBeCloseTo(Math.pow(1.05, 3));
  });

  it("should expand and extract -1::tag1, tag2:: syntax", () => {
    const result = extractWeightedTags("-1::neg1, neg2::", "prompt");
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      name: "neg1",
      weight: 1.0,
      isNegative: true,
      source: "prompt",
    });
    expect(result[1]).toEqual({
      name: "neg2",
      weight: 1.0,
      isNegative: true,
      source: "prompt",
    });
  });

  it("should mark all tags as negative when isNegativePrompt is true", () => {
    const result = extractWeightedTags("bad quality, lowres", "negative", true);
    expect(result).toHaveLength(2);
    expect(result[0].isNegative).toBe(true);
    expect(result[1].isNegative).toBe(true);
  });

  it("should not duplicate tags", () => {
    const result = extractWeightedTags("1girl, 1girl, red eyes", "prompt");
    expect(result).toHaveLength(2);
  });

  it("should use correct source", () => {
    const promptTags = extractWeightedTags("tag1", "prompt");
    const v4BaseTags = extractWeightedTags("tag1", "v4_base");
    const v4CharTags = extractWeightedTags("tag1", "v4_char");
    const negativeTags = extractWeightedTags("tag1", "negative");

    expect(promptTags[0].source).toBe("prompt");
    expect(v4BaseTags[0].source).toBe("v4_base");
    expect(v4CharTags[0].source).toBe("v4_char");
    expect(negativeTags[0].source).toBe("negative");
  });
});

describe("parsePromptData", () => {
  it("should parse valid JSON comment", () => {
    const comment = JSON.stringify({
      prompt: "1girl, red eyes",
      seed: 12345,
      steps: 28,
      scale: 7.5,
      width: 1024,
      height: 1024,
      sampler: "k_euler",
    });

    const result = parsePromptData(comment);
    expect(result.prompt).toBe("1girl, red eyes");
    expect(result.seed).toBe(12345);
    expect(result.steps).toBe(28);
    expect(result.scale).toBe(7.5);
    expect(result.width).toBe(1024);
    expect(result.height).toBe(1024);
    expect(result.sampler).toBe("k_euler");
    expect(result.tags).toHaveLength(2);
  });

  it("should return empty data for invalid JSON", () => {
    const result = parsePromptData("not valid json");
    expect(result.prompt).toBeNull();
    expect(result.seed).toBeNull();
    expect(result.tags).toHaveLength(0);
    expect(result.rawComment).toBe("not valid json");
  });

  it("should parse v4_prompt data", () => {
    const comment = JSON.stringify({
      v4_prompt: {
        caption: {
          base_caption: "masterpiece, best quality",
          char_captions: [
            { char_caption: "1girl, red eyes", centers: [{ x: 0.5, y: 0.5 }] },
          ],
        },
        use_coords: true,
        use_order: true,
        legacy_uc: false,
      },
    });

    const result = parsePromptData(comment);
    expect(result.v4BaseCaption).toBe("masterpiece, best quality");
    expect(result.v4CharCaptions).toHaveLength(1);
    expect(result.tags.some((t) => t.source === "v4_base")).toBe(true);
    expect(result.tags.some((t) => t.source === "v4_char")).toBe(true);
  });

  it("should parse negative prompt (uc)", () => {
    const comment = JSON.stringify({
      prompt: "1girl",
      uc: "bad quality, lowres",
    });

    const result = parsePromptData(comment);
    expect(result.negativePrompt).toBe("bad quality, lowres");
    const negativeTags = result.tags.filter((t) => t.isNegative);
    expect(negativeTags).toHaveLength(2);
    expect(negativeTags[0].source).toBe("negative");
  });

  it("should handle complex prompt with all weight syntaxes", () => {
    const comment = JSON.stringify({
      prompt: "[[tag1, tag2]], {{{emphasis1, emphasis2}}}, -1::neg1, neg2::, normal",
    });

    const result = parsePromptData(comment);

    // Should have 7 unique tags
    expect(result.tags).toHaveLength(7);

    // Check tag1 and tag2 have de-emphasis weight
    const tag1 = result.tags.find((t) => t.name === "tag1");
    const tag2 = result.tags.find((t) => t.name === "tag2");
    expect(tag1?.weight).toBeCloseTo(0.9025);
    expect(tag2?.weight).toBeCloseTo(0.9025);

    // Check emphasis tags
    const emphasis1 = result.tags.find((t) => t.name === "emphasis1");
    const emphasis2 = result.tags.find((t) => t.name === "emphasis2");
    expect(emphasis1?.weight).toBeCloseTo(Math.pow(1.05, 3));
    expect(emphasis2?.weight).toBeCloseTo(Math.pow(1.05, 3));

    // Check negative tags
    const neg1 = result.tags.find((t) => t.name === "neg1");
    const neg2 = result.tags.find((t) => t.name === "neg2");
    expect(neg1?.isNegative).toBe(true);
    expect(neg2?.isNegative).toBe(true);

    // Check normal tag
    const normal = result.tags.find((t) => t.name === "normal");
    expect(normal?.weight).toBe(1.0);
    expect(normal?.isNegative).toBe(false);
  });

  it("should not duplicate tags from different sources", () => {
    const comment = JSON.stringify({
      prompt: "1girl, masterpiece",
      v4_prompt: {
        caption: {
          base_caption: "1girl, best quality",
          char_captions: [],
        },
        use_coords: false,
        use_order: false,
        legacy_uc: false,
      },
    });

    const result = parsePromptData(comment);
    // "1girl" appears in both prompt and v4_prompt, should only be counted once
    const girlTags = result.tags.filter((t) => t.name === "1girl");
    expect(girlTags).toHaveLength(1);
    // First occurrence should be from "prompt" source
    expect(girlTags[0].source).toBe("prompt");
  });
});
