// Roll once per match so routes stay intentional rather than jittering each frame.
export function createBotStyle(random = Math.random) {
  return {
    speed: 0.85 + random() * 0.3,
    thinking: 0.8 + random() * 0.5,
    nectar: 0.65 + random() * 0.7,
    homeAt: 7 + random() * 4,
  };
}
