import { describe, expect, it } from "vitest";
import { tmpdir } from "node:os";
import { connectAcpAgent } from "../../server/transports/cli/acp-connection.js";

describe("acp connection", () => {
  // The ndjson buffer only guards a single unterminated line; a child that
  // prints one huge line must be killed and its pending requests rejected.
  it("kills the agent and rejects pending requests when stdout exceeds the capture limit", async () => {
    const connection = connectAcpAgent({
      command: process.execPath,
      // Print 3 MiB with no newline, then stay alive so the kill path is exercised.
      args: ["-e", 'process.stdout.write("x".repeat(3 * 1024 * 1024)); setInterval(() => {}, 1000);'],
      cwd: tmpdir(),
    });
    const pending = connection.request("session/prompt", {});
    const exited = new Promise<string>((resolve) => connection.onExit(resolve));
    const reason = await exited;
    expect(reason).toContain("exceeded the capture limit");
    await expect(pending).rejects.toThrow(reason);
    expect(connection.pid).not.toBeNull();
    connection.close();
  });

  it("rejects a request made after the process exited", async () => {
    const connection = connectAcpAgent({
      command: process.execPath,
      args: ["-e", "process.exit(0)"],
      cwd: tmpdir(),
    });
    const exited = new Promise<string>((resolve) => connection.onExit(resolve));
    await exited;
    await expect(connection.request("initialize", {})).rejects.toThrow();
    connection.close();
  });
});
