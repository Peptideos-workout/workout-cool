interface QuitProgramSessionInput {
  isEmbed: boolean;
  quitWorkout: () => void;
  setHasStartedWorkout: (started: boolean) => void;
  push: (href: string) => void;
}

export function quitProgramSession({ isEmbed, quitWorkout, setHasStartedWorkout, push }: QuitProgramSessionInput) {
  quitWorkout();
  setHasStartedWorkout(false);
  if (isEmbed) push("/?embed=1");
}
