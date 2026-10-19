import { test } from "node:test";
import assert from "node:assert/strict";

import { stripLocalePrefix } from "./locale-path";

import { SiteConfig } from "@/shared/config/site-config";
import { LocalizedMetadata } from "@/shared/config/localized-metadata";
import { getHomeMetadata, getOgImageName, getOgLocale, getProgramsMetadata, getProgramsOpenGraphTitle } from "@/shared/config/home-metadata";

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
