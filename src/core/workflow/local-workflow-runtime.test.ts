import { assertEquals } from "@std/assert";
import { LocalWorkflowRuntime } from "./local-workflow-runtime.ts";

Deno.test("LocalWorkflowRuntime executes workflow definition", async () => {
  const runtime = new LocalWorkflowRuntime();
  const result = await runtime.run({
    id: "test-workflow",
    async run(event, step) {
      return await step.do("double", async () => event.payload.value * 2);
    },
  }, {
    payload: { value: 21 },
    id: "test-event",
    timestamp: Date.now(),
  });

  assertEquals(result, 42);
});
