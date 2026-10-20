import { WorkoutSessionTimer } from "@/features/workout-session/ui/workout-session-timer";

export const Footer = async () => {
  return (
    <footer
      className={
        "relative rounded-b-lg border-t border-base-300 bg-base-100 px-2 py-2 dark:border-gray-800 dark:bg-black sm:px-6 " +
        "max-sm:order-2 max-sm:shrink-0 max-sm:!border-transparent max-sm:!bg-transparent max-sm:px-2 max-sm:py-0"
      }
      data-wc-chrome="footer"
    >
      <WorkoutSessionTimer />
    </footer>
  );
};
