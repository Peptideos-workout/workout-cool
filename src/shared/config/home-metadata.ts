import type { Metadata } from "next";
import type { SupportedLocale } from "@/shared/config/localized-metadata";

import { getServerUrl } from "@/shared/lib/server-url";
import { SiteConfig } from "@/shared/config/site-config";

interface HomeMetadataCopy {
  title: string;
  description: string;
  keywords: string[];
}

interface ProgramsMetadataCopy {
  title: string;
  description: string;
}

const homeMetadataByLocale: Record<SupportedLocale, HomeMetadataCopy> = {
  en: {
    title: "Build Your Perfect Workout",
    description:
      "Create free workout routines with our comprehensive exercise database. Track your progress and achieve your fitness goals. 🏋️",
    keywords: ["workout builder", "exercise planner", "fitness routine", "personalized training", "muscle targeting", "free workout"],
  },
  fr: {
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
  },
  es: {
    title: "Crea Tu Entrenamiento Perfecto",
    description:
      "Crea rutinas de entrenamiento gratuitas con nuestra base de datos completa de ejercicios. Sigue tu progreso y alcanza tus objetivos de fitness. 🏋️",
    keywords: [
      "creador de entrenamientos",
      "planificador de ejercicios",
      "rutina fitness",
      "entrenamiento personalizado",
      "enfoque muscular",
      "entrenamiento gratis",
    ],
  },
  pt: {
    title: "Crie o Seu Treino Perfeito",
    description:
      "Crie rotinas de treino gratuitas com a nossa base de dados abrangente de exercícios. Acompanhe o seu progresso e alcance os seus objetivos de fitness. 🏋️",
    keywords: ["criador de treinos", "planejador de exercícios", "rotina fitness", "treino personalizado", "foco muscular", "treino grátis"],
  },
  ru: {
    title: "Создайте свою идеальную тренировку",
    description:
      "Создавайте бесплатные программы тренировок с нашей обширной базой данных упражнений. Отслеживайте свой прогресс и достигайте своих фитнес-целей. 🏋️",
    keywords: [
      "конструктор тренировок",
      "планировщик упражнений",
      "фитнес-программа",
      "персональная тренировка",
      "проработка мышц",
      "бесплатная тренировка",
    ],
  },
  "zh-CN": {
    title: "打造您的完美锻炼",
    description: "使用我们全面的运动数据库，免费创建锻炼计划。跟踪您的进度，实现您的健身目标。 🏋️",
    keywords: ["锻炼创建器", "运动计划器", "健身计划", "个性化训练", "肌肉针对性训练", "免费锻炼"],
  },
};

const programsMetadataByLocale: Record<SupportedLocale, ProgramsMetadataCopy> = {
  en: {
    title: "Programs",
    description: "Discover our gamified workout programs for all levels - Join the WorkoutCool community!",
  },
  fr: {
    title: "Programmes",
    description: "Découvrez nos programmes d'entraînement gamifiés pour tous les niveaux - Rejoins la communauté WorkoutCool !",
  },
  es: {
    title: "Programas",
    description: "Descubre nuestros programas de entrenamiento gamificados para todos los niveles - ¡Únete a la comunidad WorkoutCool!",
  },
  pt: {
    title: "Programas",
    description: "Descubra os nossos programas de treino gamificados para todos os níveis - Junte-se à comunidade WorkoutCool!",
  },
  ru: {
    title: "Программы",
    description: "Откройте наши геймифицированные программы тренировок для всех уровней - Присоединяйтесь к сообществу WorkoutCool!",
  },
  "zh-CN": {
    title: "课程",
    description: "发现适合所有水平的游戏化锻炼计划 - 加入 WorkoutCool 社区！",
  },
};

function isSupportedLocale(locale: string): locale is SupportedLocale {
  return Object.prototype.hasOwnProperty.call(homeMetadataByLocale, locale);
}

function resolveSupportedLocale(locale: string): SupportedLocale {
  if (isSupportedLocale(locale)) {
    return locale;
  }

  return "en";
}

export function getHomeMetadata(locale: string): HomeMetadataCopy {
  return homeMetadataByLocale[resolveSupportedLocale(locale)];
}

export function getProgramsMetadata(locale: string): ProgramsMetadataCopy {
  return programsMetadataByLocale[resolveSupportedLocale(locale)];
}

const ogLocaleByLocale: Record<SupportedLocale, string> = {
  en: "en_US",
  fr: "fr_FR",
  es: "es_ES",
  pt: "pt_PT",
  ru: "ru_RU",
  "zh-CN": "zh_CN",
};

export function getOgLocale(locale: string): string {
  return ogLocaleByLocale[resolveSupportedLocale(locale)];
}

export function getOgImageName(locale: string): string {
  const resolved = resolveSupportedLocale(locale);
  const imageLocale = resolved === "zh-CN" ? "zh" : resolved;
  return `default-og-image_${imageLocale}.jpg`;
}

export function getProgramsOpenGraphTitle(locale: string): string {
  return `${getProgramsMetadata(locale).title} | ${SiteConfig.title}`;
}

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
] as const;

export function getLayoutOgLocale(locale: string): string {
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

export function getLayoutOgAlternateLocales(locale: string): string[] {
  const current = getLayoutOgLocale(locale);
  return layoutOgAlternateLocales.filter((alt) => alt !== current);
}

export function getLayoutSocialMetadata(locale: string): {
  openGraph: {
    type: "website";
    siteName: string;
    url: string;
    locale: string;
    alternateLocale: string[];
  };
  twitter: {
    card: "summary_large_image";
    site: string;
    creator: string;
  };
} {
  return {
    openGraph: {
      type: "website",
      siteName: SiteConfig.title,
      url: getServerUrl(),
      locale: getLayoutOgLocale(locale),
      alternateLocale: getLayoutOgAlternateLocales(locale),
    },
    twitter: {
      card: "summary_large_image",
      site: SiteConfig.seo.twitterHandle,
      creator: SiteConfig.seo.twitterHandle,
    },
  };
}

export function getHomePageMetadata(locale: string): Metadata {
  const { title, description, keywords } = getHomeMetadata(locale);
  const social = getLayoutSocialMetadata(locale);
  const ogImageName = getOgImageName(locale);
  const imageUrl = `${getServerUrl()}/images/${ogImageName}`;

  return {
    title,
    description,
    keywords,
    openGraph: {
      ...social.openGraph,
      title: `${title} | ${SiteConfig.title}`,
      description,
      locale: getOgLocale(locale),
      images: [
        {
          url: imageUrl,
          width: SiteConfig.seo.ogImage.width,
          height: SiteConfig.seo.ogImage.height,
          alt: title,
        },
      ],
    },
    twitter: {
      ...social.twitter,
      title: `${title} | ${SiteConfig.title}`,
      description,
      images: [imageUrl],
    },
  };
}

export function getProgramsPageMetadata(locale: string): Metadata {
  const { title, description } = getProgramsMetadata(locale);
  const social = getLayoutSocialMetadata(locale);
  const socialTitle = getProgramsOpenGraphTitle(locale);
  const ogImageName = getOgImageName(locale);
  const imageUrl = `${getServerUrl()}/images/${ogImageName}`;

  return {
    title,
    description,
    openGraph: {
      ...social.openGraph,
      title: socialTitle,
      description,
      locale: getOgLocale(locale),
      images: [
        {
          url: imageUrl,
          width: SiteConfig.seo.ogImage.width,
          height: SiteConfig.seo.ogImage.height,
          alt: title,
        },
      ],
    },
    twitter: {
      ...social.twitter,
      title: socialTitle,
      description,
      images: [imageUrl],
    },
  };
}
