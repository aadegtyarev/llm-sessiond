export function createCycleAdapter(inputEnabled: boolean) {
  let launches = 0;
  let stops = 0;
  let failLaunch = false;
  let failStop = false;
  let failInput = false;
  let resumes = 0;
  let submits = 0;
  const texts: string[] = [];
  const adapter = {
    descriptor: {
      id: "test",
      aliases: [],
      capabilities: [
        "harness.launch",
        "harness.stop",
        ...(inputEnabled ? ["harness.resume", "input.submit"] : []),
      ],
    },
    validateCheckpoint: () => true,
    isResumable: () => inputEnabled,
  };
  const factory = {
    create: () => ({
      ...(inputEnabled
        ? {
            inputs: {
              submit: async (input: { inputId: string; text: string }) => {
                submits++;
                texts.push(input.text);
                return failInput
                  ? {
                      kind: "rejected" as const,
                      reason: "prompt_rejected" as const,
                    }
                  : { kind: "accepted" as const };
              },
              cancel: async () => ({ kind: "accepted" as const }),
              subscribe: () => () => {},
            },
          }
        : {}),
      launch: async () => {
        launches++;
        if (failLaunch) throw new Error("PRIVATE LAUNCH DETAIL");
        return { nativeSessionId: "native-safe" };
      },
      resume: async () => {
        resumes++;
        return {};
      },
      stop: async () => {
        stops++;
        if (failStop) throw new Error("PRIVATE STOP DETAIL");
      },
    }),
  };
  return {
    adapter,
    factory,
    effects: () => ({ launches, stops }),
    inputEffects: () => ({ resumes, submits, texts }),
    failLaunch: (value: boolean) => {
      failLaunch = value;
    },
    failStop: (value: boolean) => {
      failStop = value;
    },
    failInput: (value: boolean) => {
      failInput = value;
    },
  };
}
