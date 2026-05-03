import { WorkoutSessionTimer } from "@/features/workout-session/ui/workout-session-timer";
import UserLeaderboardPosition from "@/features/leaderboard/ui/user-leaderboard-position";

export const Footer = async () => {
  return (
    <footer className="relative border-t border-base-300 dark:border-gray-800 bg-base-100 dark:bg-black px-2 sm:px-6 py-2 rounded-b-lg">
      <WorkoutSessionTimer />
      <UserLeaderboardPosition />
    </footer>
  );
};
