import { tool } from "@opencode-ai/plugin";
import { spawn } from "node:child_process";

export default async function PiVerifierA2APlugin({ serverUrl }) {
  return {
    tool: {
      pi_verifier_delegate: tool({
        description: "Delegate pi-verifier to Pi through A2A and notify this opencode session when complete.",
        args: {
          project_root: tool.schema.string().describe("Absolute project root to verify"),
        },
        async execute(args, context) {
          const chunks = [];
          const child = spawn("/home/rec/.pi/agent/bin/pi-verifier-delegate", [args.project_root], {
            env: {
              ...process.env,
              OPENCODE_SERVER_URL: String(serverUrl),
              OPENCODE_SESSION_ID: context.sessionID,
              OPENCODE_DIRECTORY: context.directory,
            },
            stdio: ["ignore", "pipe", "pipe"],
          });

          let stdout = "";
          let stderr = "";
          child.stdout.setEncoding("utf8");
          child.stderr.setEncoding("utf8");
          child.stdout.on("data", (chunk) => {
            stdout += chunk;
            chunks.push(chunk);
          });
          child.stderr.on("data", (chunk) => {
            stderr += chunk;
          });

          const code = await new Promise((resolve) => {
            child.on("error", () => resolve(1));
            child.on("close", (exitCode) => resolve(exitCode ?? 0));
          });

          if (code !== 0) {
            return `pi_verifier_delegate failed: ${stderr || stdout || `exit ${code}`}`;
          }

          let handle;
          try {
            handle = JSON.parse(stdout.trim().split("\n").at(-1));
          } catch {
            return stdout.trim() || "pi-verifier delegated, but no JSON handle was emitted";
          }

          return {
            output: JSON.stringify({
              ...handle,
              notify: "opencode-session",
              opencode_session_id: context.sessionID,
            }),
            metadata: handle,
          };
        },
      }),
    },
  };
}
