export const LocalizedMetadata = {
  en: {
    title: "WorkoutOS",
    description: "Modern fitness coaching platform with comprehensive exercise database",
    keywords: [
      "fitness",
      "workout",
      "exercise",
      "training",
      "muscle building",
      "strength training",
      "bodybuilding",
      "fitness app",
      "workout planner",
      "exercise database",
    ],
    ogAlt: "WorkoutOS - Modern fitness platform",
    applicationName: "WorkoutOS",
    category: "fitness",
    classification: "Fitness & Health",
  },
  fr: {
    title: "WorkoutOS",
    description: "Plateforme de coaching fitness moderne avec base de données d'exercices complète",
    keywords: [
      "fitness",
      "entraînement",
      "exercice",
      "musculation",
      "sport",
      "coaching",
      "programme d'entraînement",
      "application fitness",
      "planificateur d'entraînement",
      "base de données d'exercices",
    ],
    ogAlt: "WorkoutOS - Plateforme de fitness moderne",
    applicationName: "WorkoutOS",
    category: "fitness",
    classification: "Fitness et Santé",
  },
  es: {
    title: "WorkoutOS",
    description: "Plataforma moderna de entrenamiento fitness con base de datos completa de ejercicios",
    keywords: [
      "fitness",
      "entrenamiento",
      "ejercicio",
      "musculación",
      "deporte",
      "coaching",
      "programa de entrenamiento",
      "aplicación fitness",
      "planificador de entrenamientos",
      "base de datos de ejercicios",
    ],
    ogAlt: "WorkoutOS - Plataforma de fitness moderna",
    applicationName: "WorkoutOS",
    category: "fitness",
    classification: "Fitness y Salud",
  },
  pt: {
    title: "WorkoutOS",
    description: "Plataforma moderna de coaching fitness com base de dados abrangente de exercícios",
    keywords: [
      "fitness",
      "treino",
      "exercício",
      "musculação",
      "esporte",
      "coaching",
      "programa de treino",
      "aplicativo fitness",
      "planejador de treinos",
      "base de dados de exercícios",
    ],
    ogAlt: "WorkoutOS - Plataforma de fitness moderna",
    applicationName: "WorkoutOS",
    category: "fitness",
    classification: "Fitness e Saúde",
  },
  ru: {
    title: "WorkoutOS",
    description: "Современная платформа фитнес-коучинга с comprehensive базой данных упражнений",
    keywords: [
      "фитнес",
      "тренировка",
      "упражнение",
      "бодибилдинг",
      "спорт",
      "коучинг",
      "программа тренировок",
      "фитнес приложение",
      "планировщик тренировок",
      "база данных упражнений",
    ],
    ogAlt: "WorkoutOS - Современная фитнес платформа",
    applicationName: "WorkoutOS",
    category: "фитнес",
    classification: "Фитнес и Здоровье",
  },
  "zh-CN": {
    title: "WorkoutOS",
    description: "现代健身教练平台，拥有全面的运动数据库",
    keywords: ["健身", "锻炼", "运动", "训练", "肌肉训练", "力量训练", "健美", "健身应用", "锻炼计划", "运动数据库"],
    ogAlt: "WorkoutOS - 现代健身平台",
    applicationName: "WorkoutOS",
    category: "健身",
    classification: "健身与健康",
  },
} as const;

export type SupportedLocale = keyof typeof LocalizedMetadata;

export function getLocalizedMetadata(locale: string) {
  const supportedLocales: SupportedLocale[] = ["en", "fr", "es", "pt", "ru", "zh-CN"];

  if (supportedLocales.includes(locale as SupportedLocale)) {
    return LocalizedMetadata[locale as SupportedLocale];
  }

  return LocalizedMetadata.en;
}
