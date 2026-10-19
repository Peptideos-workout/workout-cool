import type { SupportedLocale } from "@/shared/config/localized-metadata";

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
      "фитнес-рутина",
      "персональная тренировка",
      "проработка мышц",
      "бесплатная тренировка",
    ],
  },
  "zh-CN": {
    title: "打造您的完美锻炼",
    description: "使用我们全面的运动数据库，免费创建锻炼计划。跟踪您的进度，实现您的健身目标。 🏋️",
    keywords: ["锻炼创建器", "运动计划器", "健身流程", "个性化训练", "肌肉针对性训练", "免费锻炼"],
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

export function getHomeOgImageName(locale: string): string {
  const imageLocale = locale === "zh-CN" ? "zh" : locale;
  return `default-og-image_${imageLocale}.jpg`;
}
