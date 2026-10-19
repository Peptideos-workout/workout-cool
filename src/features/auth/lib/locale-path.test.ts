import { test } from "node:test";
import path from "node:path";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

import { stripLocalePrefix } from "./locale-path";

import type { Metadata } from "next";

import { getServerUrl } from "@/shared/lib/server-url";
import { SiteConfig } from "@/shared/config/site-config";
import { LocalizedMetadata } from "@/shared/config/localized-metadata";
import { getHomeMetadata, getHomePageMetadata, getOgImageName, getOgLocale, getProgramsMetadata, getProgramsOpenGraphTitle, getProgramsPageMetadata } from "@/shared/config/home-metadata";

const prototypeKeys = ["constructor", "__proto__", "toString", "hasOwnProperty"];

const supportedLocales = Object.keys(LocalizedMetadata);
const cjk = /[\u3400-\u9fff]/;

const englishHome = {
  title: "Build Your Perfect Workout",
  description:
    "Create free workout routines with our comprehensive exercise database. Track your progress and achieve your fitness goals. 🏋️",
  keywords: ["workout builder", "exercise planner", "fitness routine", "personalized training", "muscle targeting", "free workout"],
};

const frenchHome = {
  title: "Créez Votre Entraînement Parfait",
  description:
    "Créez des routines d'entraînement gratuites avec notre base de données d'exercices complète. Suivez vos progrès et atteignez vos objectifs fitness. 🏋️",
  keywords: [
    "créateur d'entraînement",
    "planificateur d'exercices",
    "routine fitness",
    "entraînement personnalisé",
    "ciblage musculaire",
    "entraînement gratuit",
  ],
};

const englishPrograms = {
  title: "Programs",
  description: "Discover our gamified workout programs for all levels - Join the WorkoutCool community!",
};

const frenchPrograms = {
  title: "Programmes",
  description: "Découvrez nos programmes d'entraînement gamifiés pour tous les niveaux - Rejoins la communauté WorkoutCool !",
};

test("strips locale prefixes case-insensitively, including zh-cn", () => {
  assert.equal(stripLocalePrefix("/auth/signup"), "/auth/signup");
  assert.equal(stripLocalePrefix("/en/auth/signup"), "/auth/signup");
  assert.equal(stripLocalePrefix("/zh-CN/auth/signup"), "/auth/signup");
  assert.equal(stripLocalePrefix("/zh-cn/auth/signup"), "/auth/signup");
  assert.equal(stripLocalePrefix("/ZH-CN/auth/signin"), "/auth/signin");
  assert.equal(stripLocalePrefix("/pt/auth/signout/"), "/auth/signout");
  assert.equal(stripLocalePrefix("/fr/legal/privacy"), "/legal/privacy");
});

test("treats a locale-only path as root", () => {
  assert.equal(stripLocalePrefix("/en"), "/");
  assert.equal(stripLocalePrefix("/zh-cn"), "/");
  assert.equal(stripLocalePrefix("/zh-CN/"), "/");
});

test("home metadata is non-empty for every supported locale", () => {
  assert.deepEqual([...supportedLocales].sort(), ["en", "es", "fr", "pt", "ru", "zh-CN"].sort());

  for (const locale of supportedLocales) {
    const metadata = getHomeMetadata(locale);
    assert.ok(metadata.title.trim().length > 0, locale);
    assert.ok(metadata.description.trim().length > 0, locale);
    assert.ok(metadata.keywords.length > 0, locale);
    for (const keyword of metadata.keywords) {
      assert.ok(keyword.trim().length > 0, `${locale} keyword`);
    }
  }
});

test("non-French home titles are not the French string, and zh-CN uses CJK", () => {
  for (const locale of supportedLocales) {
    if (locale === "fr") {
      continue;
    }
    assert.notEqual(getHomeMetadata(locale).title, frenchHome.title, locale);
  }
  assert.match(getHomeMetadata("zh-CN").title, cjk);
});

test("unknown and wrong-case locales fall back to English home metadata", () => {
  for (const locale of ["zh-cn", "ZH-CN", "not-a-locale", "", ...prototypeKeys]) {
    assert.deepEqual(getHomeMetadata(locale), englishHome, locale);
  }
});

test("English and French home metadata stay byte-identical", () => {
  assert.deepEqual(getHomeMetadata("en"), englishHome);
  assert.deepEqual(getHomeMetadata("fr"), frenchHome);
});

test("zh-CN home og image name uses _zh", () => {
  assert.equal(getOgImageName("zh-CN"), "default-og-image_zh.jpg");
  assert.match(getOgImageName("zh-CN"), /_zh\.jpg$/);
  assert.doesNotMatch(getOgImageName("zh-CN"), /zh-CN/);
  assert.equal(getOgImageName("en"), "default-og-image_en.jpg");
  assert.equal(getOgImageName("fr"), "default-og-image_fr.jpg");
  assert.equal(getOgImageName("zh-cn"), "default-og-image_en.jpg");
  assert.equal(getOgImageName("not-a-locale"), "default-og-image_en.jpg");
  assert.equal(getOgImageName("es"), "default-og-image_es.jpg");
  assert.equal(getOgImageName("pt"), "default-og-image_pt.jpg");
  assert.equal(getOgImageName("ru"), "default-og-image_ru.jpg");
  for (const locale of prototypeKeys) {
    assert.equal(getOgImageName(locale), "default-og-image_en.jpg", locale);
  }
});

test("programs og image follows the locale and is not the French file", () => {
  assert.equal(getOgImageName("en"), "default-og-image_en.jpg");
  assert.equal(getOgImageName("fr"), "default-og-image_fr.jpg");
  assert.equal(getOgImageName("es"), "default-og-image_es.jpg");
  assert.equal(getOgImageName("pt"), "default-og-image_pt.jpg");
  assert.equal(getOgImageName("ru"), "default-og-image_ru.jpg");
  assert.equal(getOgImageName("zh-CN"), "default-og-image_zh.jpg");
  for (const locale of ["en", "es", "pt", "ru", "zh-CN"]) {
    assert.doesNotMatch(getOgImageName(locale), /_fr/, locale);
  }
});

test("og locale matches each supported locale and falls back to en_US", () => {
  assert.equal(getOgLocale("en"), "en_US");
  assert.equal(getOgLocale("fr"), "fr_FR");
  assert.equal(getOgLocale("es"), "es_ES");
  assert.equal(getOgLocale("pt"), "pt_PT");
  assert.equal(getOgLocale("ru"), "ru_RU");
  assert.equal(getOgLocale("zh-CN"), "zh_CN");
  for (const locale of ["zh-cn", "not-a-locale", ...prototypeKeys]) {
    assert.equal(getOgLocale(locale), "en_US", locale);
  }
});

test("programs open graph title uses the localized title", () => {
  for (const locale of supportedLocales) {
    const metadata = getProgramsMetadata(locale);
    assert.equal(getProgramsOpenGraphTitle(locale), `${metadata.title} | ${SiteConfig.title}`, locale);
    assert.notEqual(getProgramsOpenGraphTitle(locale), SiteConfig.title, locale);
  }
  assert.equal(getProgramsOpenGraphTitle("en"), "Programs | WorkoutOS");
  assert.equal(getProgramsOpenGraphTitle("fr"), "Programmes | WorkoutOS");
  assert.equal(getProgramsOpenGraphTitle("constructor"), `Programs | ${SiteConfig.title}`);
});

test("programs titles are localized, English is not Programmes, and unknown locales fall back", () => {
  for (const locale of supportedLocales) {
    const metadata = getProgramsMetadata(locale);
    assert.ok(metadata.title.trim().length > 0, locale);
    assert.ok(metadata.description.trim().length > 0, locale);
    if (locale !== "fr") {
      assert.notEqual(metadata.title, frenchPrograms.title, locale);
    }
  }

  assert.equal(getProgramsMetadata("en").title, "Programs");
  assert.notEqual(getProgramsMetadata("en").title, "Programmes");
  assert.match(getProgramsMetadata("en").description, /[A-Za-z]/);
  assert.match(getProgramsMetadata("zh-CN").title, cjk);
  assert.deepEqual(getProgramsMetadata("en"), englishPrograms);
  assert.deepEqual(getProgramsMetadata("fr"), frenchPrograms);
  for (const locale of ["zh-cn", "unknown", ...prototypeKeys]) {
    assert.deepEqual(getProgramsMetadata(locale), englishPrograms, locale);
  }
  assert.ok(getHomeMetadata("ru").keywords.includes("фитнес-программа"));
  assert.ok(getHomeMetadata("zh-CN").keywords.includes("健身计划"));
});

const layoutOgAlternateLocales = [
  "fr_FR",
  "fr_CA",
  "fr_CH",
  "fr_BE",
  "en_US",
  "en_GB",
  "en_CA",
  "en_AU",
  "es_ES",
  "es_MX",
  "es_AR",
  "es_CL",
  "pt_PT",
  "pt_BR",
  "ru_RU",
  "ru_BY",
  "ru_KZ",
  "zh_CN",
  "zh_TW",
  "zh_HK",
];

function layoutOgLocale(locale: string): string {
  return locale === "en"
    ? "en_US"
    : locale === "es"
      ? "es_ES"
      : locale === "pt"
        ? "pt_PT"
        : locale === "ru"
          ? "ru_RU"
          : locale === "zh-CN"
            ? "zh_CN"
            : "fr_FR";
}

function assertLayoutSocialBase(metadata: Metadata, locale: string) {
  const openGraph = metadata.openGraph as {
    type?: string;
    siteName?: string;
    url?: string;
    alternateLocale?: string[];
  } | null;
  const twitter = metadata.twitter;
  assert.ok(openGraph);
  assert.ok(twitter);
  assert.equal(openGraph.type, "website");
  assert.equal(openGraph.siteName, SiteConfig.title);
  assert.equal(openGraph.url, getServerUrl());
  assert.deepEqual(
    openGraph.alternateLocale,
    layoutOgAlternateLocales.filter((alt) => alt !== layoutOgLocale(locale))
  );
  assert.equal(Array.isArray(openGraph.alternateLocale) ? openGraph.alternateLocale.length : 0, 19);
  assert.equal("card" in twitter ? twitter.card : undefined, "summary_large_image");
  assert.equal("site" in twitter ? twitter.site : undefined, SiteConfig.seo.twitterHandle);
  assert.equal("creator" in twitter ? twitter.creator : undefined, SiteConfig.seo.twitterHandle);
}

function ogDetails(metadata: Metadata) {
  const openGraph = metadata.openGraph as {
    locale?: string;
    title?: string;
    alternateLocale?: string[];
    images?: Array<{ url?: string } | string> | { url?: string };
  };
  const images = openGraph.images;
  const first = Array.isArray(images) ? images[0] : images;
  const url = typeof first === "string" ? first : (first?.url ?? "");

  return {
    locale: openGraph.locale,
    title: typeof openGraph.title === "string" ? openGraph.title : "",
    alternateLocale: openGraph.alternateLocale ?? [],
    imageName: url.split("/").pop() ?? "",
  };
}

test("home and programs spread the layout open graph and twitter base", async () => {
  for (const locale of supportedLocales) {
    assertLayoutSocialBase(getHomePageMetadata(locale), locale);
    assertLayoutSocialBase(getProgramsPageMetadata(locale), locale);
  }

  const localizedPages = [
    {
      locale: "en",
      ogLocale: "en_US",
      image: "default-og-image_en.jpg",
      homeTitle: "Build Your Perfect Workout",
      programsTitle: "Programs",
    },
    {
      locale: "fr",
      ogLocale: "fr_FR",
      image: "default-og-image_fr.jpg",
      homeTitle: "Créez Votre Entraînement Parfait",
      programsTitle: "Programmes",
    },
    {
      locale: "zh-CN",
      ogLocale: "zh_CN",
      image: "default-og-image_zh.jpg",
      homeTitle: "打造您的完美锻炼",
      programsTitle: "课程",
    },
  ] as const;

  for (const page of localizedPages) {
    const home = ogDetails(getHomePageMetadata(page.locale));
    const programs = ogDetails(getProgramsPageMetadata(page.locale));
    assert.equal(home.locale, page.ogLocale, page.locale);
    assert.equal(programs.locale, page.ogLocale, page.locale);
    assert.equal(home.imageName, page.image, page.locale);
    assert.equal(programs.imageName, page.image, page.locale);
    assert.equal(getHomePageMetadata(page.locale).title, page.homeTitle, page.locale);
    assert.equal(getProgramsPageMetadata(page.locale).title, page.programsTitle, page.locale);
    assert.equal(home.title, `${page.homeTitle} | ${SiteConfig.title}`, page.locale);
    assert.equal(programs.title, `${page.programsTitle} | ${SiteConfig.title}`, page.locale);
  }
});

function firstSocialImage(images: unknown) {
  const first = Array.isArray(images) ? images[0] : images;
  if (typeof first === "string" || first instanceof URL) {
    return { url: String(first), width: undefined, height: undefined, alt: undefined };
  }
  const image = first as { url?: string | URL; width?: number; height?: number; alt?: string } | undefined;
  return {
    url: image?.url === undefined ? "" : String(image.url),
    width: image?.width,
    height: image?.height,
    alt: image?.alt,
  };
}

test("home and programs twitter images match the open graph image", () => {
  for (const locale of supportedLocales) {
    for (const metadata of [getHomePageMetadata(locale), getProgramsPageMetadata(locale)]) {
      const openGraph = metadata.openGraph as { images?: unknown } | null;
      const twitter = metadata.twitter as { images?: unknown } | null;
      const ogImage = firstSocialImage(openGraph?.images);
      const twitterImage = firstSocialImage(twitter?.images);
      assert.equal(twitterImage.url, ogImage.url, locale);
      assert.equal(twitterImage.width, ogImage.width, locale);
      assert.equal(twitterImage.height, ogImage.height, locale);
      assert.equal(twitterImage.alt, ogImage.alt, locale);
      assert.equal(typeof twitterImage.alt, "string", locale);
      assert.ok((twitterImage.alt ?? "").length > 0, locale);
    }
  }
});

function jpegSize(buffer: Buffer) {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    throw new Error("not a jpeg");
  }

  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < buffer.length && buffer[offset] === 0xff) {
      offset += 1;
    }
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9) {
      continue;
    }
    if (marker === 0xda) {
      break;
    }
    const length = buffer.readUInt16BE(offset);
    if (marker === 0xc0 || marker === 0xc2) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    }
    offset += length;
  }

  throw new Error("jpeg SOF0/SOF2 marker not found");
}

test("home and programs image dimensions match the jpeg files", () => {
  const imagesDir = path.resolve(process.cwd(), "public/images");
  const mismatches: string[] = [];

  for (const locale of supportedLocales) {
    const imageName = getOgImageName(locale);
    const actual = jpegSize(readFileSync(path.join(imagesDir, imageName)));

    for (const metadata of [getHomePageMetadata(locale), getProgramsPageMetadata(locale)]) {
      const openGraph = metadata.openGraph as { images?: unknown } | null;
      const twitter = metadata.twitter as { images?: unknown } | null;
      const ogImage = firstSocialImage(openGraph?.images);
      const twitterImage = firstSocialImage(twitter?.images);
      if (ogImage.width !== actual.width || ogImage.height !== actual.height) {
        mismatches.push(`${locale} og ${ogImage.width}x${ogImage.height} file ${actual.width}x${actual.height}`);
      }
      if (twitterImage.width !== actual.width || twitterImage.height !== actual.height) {
        mismatches.push(`${locale} twitter ${twitterImage.width}x${twitterImage.height} file ${actual.width}x${actual.height}`);
      }
      const twitterMatchesOg =
        twitterImage.url === ogImage.url &&
        twitterImage.width === ogImage.width &&
        twitterImage.height === ogImage.height &&
        twitterImage.alt === ogImage.alt;
      if (!twitterMatchesOg) {
        mismatches.push(`${locale} twitter image differs from og`);
      }
    }
  }

  assert.deepEqual(mismatches, []);
});

test("unknown and prototype locales omit the page og locale from alternates", () => {
  for (const locale of ["not-a-locale", ...prototypeKeys]) {
    for (const metadata of [getHomePageMetadata(locale), getProgramsPageMetadata(locale)]) {
      const openGraph = ogDetails(metadata);
      assert.equal(openGraph.locale, "en_US", locale);
      assert.equal(openGraph.alternateLocale.length, 19, locale);
      assert.equal(openGraph.alternateLocale.includes("en_US"), false, locale);
      assert.equal(openGraph.alternateLocale.includes("fr_FR"), true, locale);
    }
  }
});
