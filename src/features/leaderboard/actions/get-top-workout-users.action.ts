"use server";

import { z } from "zod";
import dayjs from "dayjs";
import { Prisma } from "@prisma/client";

import { prisma } from "@/shared/lib/prisma";
import { actionClient } from "@/shared/api/safe-actions";
import { TopWorkoutUser } from "@/features/leaderboard/models/types";
import { getDateRangeForPeriod } from "@/features/leaderboard/lib/utils";

const LIMIT_TOP_USERS = 20;

export type LeaderboardPeriod = "all-time" | "weekly" | "monthly";

const inputSchema = z.object({
  period: z.enum(["all-time", "weekly", "monthly"]).default("all-time"),
});

export const getTopWorkoutUsersAction = actionClient.schema(inputSchema).action(async ({ parsedInput }) => {
  const { period } = parsedInput;

  try {
    const { startDate, endDate } = getDateRangeForPeriod(period);

    const whereClause = {
      WorkoutSession: {
        some: startDate
          ? {
              startedAt: {
                gte: startDate,
                lte: endDate,
              },
            }
          : {},
      },
    };

    const topUsers = await prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        createdAt: true,
        _count: {
          select: {
            WorkoutSession: startDate
              ? {
                  where: {
                    startedAt: {
                      gte: startDate,
                      lte: endDate,
                    },
                  },
                }
              : true,
          },
        },
        WorkoutSession: {
          where: startDate
            ? {
                startedAt: {
                  gte: startDate,
                  lte: endDate,
                },
              }
            : undefined,
          select: {
            endedAt: true,
            startedAt: true,
          },
          orderBy: {
            startedAt: "desc",
          },
          take: 1,
        },
      },
      orderBy: {
        WorkoutSession: {
          _count: "desc",
        },
      },
      take: LIMIT_TOP_USERS,
    });

    const ranked = topUsers
      .map((user) => {
        const totalWorkouts = user._count.WorkoutSession;
        const lastWorkout = user.WorkoutSession[0];
        const lastWorkoutAt = lastWorkout?.endedAt || lastWorkout?.startedAt || null;

        const joinedAt = user.createdAt;
        const weeksSinceStart = Math.max(1, Math.ceil(dayjs().diff(dayjs(joinedAt), "week", true)));

        const averageWorkoutsPerWeek = Math.round((totalWorkouts / weeksSinceStart) * 10) / 10;

        return {
          userId: user.id,
          userName: user.name,
          userImage: user.image,
          emailKey: user.email.trim().toLowerCase(),
          totalWorkouts,
          lastWorkoutAt: lastWorkoutAt,
          averageWorkoutsPerWeek,
          memberSince: user.createdAt,
        };
      })
      .sort((a, b) => b.totalWorkouts - a.totalWorkouts);

    const emailKeys = [...new Set(ranked.map((u) => u.emailKey))];
    /** PeptideOS: same Supabase DB — enrich display name + avatar from public.profiles (auth signup). */
    const peptideMeta = new Map<string, { fullName: string | null; avatarUrl: string | null }>();
    if (emailKeys.length > 0) {
      try {
        const peptideRows = await prisma.$queryRaw<{ em: string; full_name: string | null; avatar_url: string | null }[]>`
          SELECT DISTINCT lower(trim(au.email)) AS em,
                          p.full_name,
                          p.avatar_url
          FROM auth.users au
          INNER JOIN public.profiles p ON p.id = au.id
          WHERE lower(trim(au.email)) IN (${Prisma.join(emailKeys)})
        `;
        for (const row of peptideRows) {
          peptideMeta.set(row.em, { fullName: row.full_name, avatarUrl: row.avatar_url });
        }
      } catch (e) {
        console.warn("[leaderboard] PeptideOS profile hydrate skipped:", e);
      }
    }

    const merged: TopWorkoutUser[] = ranked.map(
      ({
        emailKey,
        userName,
        userImage,
        totalWorkouts,
        lastWorkoutAt,
        averageWorkoutsPerWeek,
        memberSince,
        userId,
      }) => {
        const p = peptideMeta.get(emailKey);
        const syncedName = p?.fullName?.trim() || userName;
        const syncedImage = (p?.avatarUrl && p.avatarUrl.trim().length > 0 ? p.avatarUrl.trim() : null) || userImage;

        return {
          userId,
          userName: syncedName,
          userImage: syncedImage,
          totalWorkouts,
          lastWorkoutAt,
          averageWorkoutsPerWeek,
          memberSince,
        };
      },
    );

    return merged;
  } catch (error) {
    console.error("Error fetching top workout users:", error);
    throw new Error("Failed to fetch top workout users");
  }
});
