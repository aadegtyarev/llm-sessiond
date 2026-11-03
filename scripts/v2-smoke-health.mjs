export function assertHealthyBoot(health, previousInstanceId) {
  if (
    !health ||
    health.apiVersion !== "v2" ||
    health.status !== "ready" ||
    !health.supportedApiVersions?.includes("v1") ||
    !health.supportedApiVersions?.includes("v2") ||
    !Array.isArray(health.features) ||
    health.features.some((feature) => feature !== "events.live") ||
    typeof health.instanceId !== "string" ||
    health.instanceId.length === 0 ||
    health.instanceId === previousInstanceId
  )
    throw new Error("new process returned no healthy v2 boot");
  return health;
}
export async function connectHealthy(clientModule, origin, previousInstanceId) {
  const client = await clientModule.connectLlmSessiondV2HttpClient({
    baseUrl: origin,
  });
  return {
    client,
    health: assertHealthyBoot(await client.health(), previousInstanceId),
  };
}
