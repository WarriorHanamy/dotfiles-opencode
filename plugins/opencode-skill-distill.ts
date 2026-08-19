import { tool, type Plugin } from "@opencode-ai/plugin"
import { homedir } from "node:os"
import path from "node:path"
import { access, mkdir, writeFile } from "node:fs/promises"

const DEFAULT_TARGET_DIR = path.join(homedir(), "diff-dockers")
const DEFAULT_SKILL_DIR = path.join(homedir(), ".config", "opencode", "skills")
const MAX_TRANSCRIPT_CHARS = 120_000
const MAX_TOOL_OUTPUT_CHARS = 4_000
const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const DESCRIPTION_MAX_CHARS = 1024

const SYSTEM_PROMPT = [
  "You are a trajectory distillation engine for OpenCode.",
  "Turn a coding-agent session trajectory into one reusable SKILL.md.",
  "Extract repeatable procedure, environment facts, commands, file paths, and failure fixes.",
  "Generalize session-specific paths into placeholders like <repo-root> or <target>.",
  "Remove secrets, API keys, tokens, and personal data.",
  "Output ONLY one JSON object, no prose before or after.",
].join(" ")

/**
 * Turn a user-supplied path into an absolute path without shell expansion.
 * @param dir path that may start with `~`
 * @returns expanded absolute path
 */
function expandHome(dir: string): string {
  const value = dir.trim()
  if (value === "~") return homedir()
  if (value.startsWith("~/")) return path.join(homedir(), value.slice(2))
  return value
}

/**
 * Quote a single-line string as a YAML double-quoted scalar.
 * JSON.stringify already emits valid YAML double-quoted scalar syntax.
 */
function yamlScalar(value: string): string {
  return JSON.stringify(String(value))
}

/** Shorten long JSON-shaped tool inputs/outputs for the transcript. */
function summarizeJson(value: unknown): string {
  if (value === undefined || value === null) return ""
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/** Bound one tool output/input before it enters the transcript. */
function truncate(value: string, max: number): string {
  if (value.length <= max) return value
  return `${value.slice(0, max)}\n...[truncated ${value.length - max} chars]`
}

interface CandidateSession {
  id: string
  directory?: string
  title?: string
  time?: { created?: number; updated?: number }
}

interface TrajectoryMessage {
  info?: { role?: string }
  parts?: Array<Record<string, any>>
}

/** List OpenCode sessions under targetDir, newest first. */
async function listCandidateSessions(client: any, targetDir: string): Promise<CandidateSession[]> {
  const root = targetDir.endsWith(path.sep) ? targetDir.slice(0, -1) : targetDir
  const matches = (sessions: CandidateSession[]): CandidateSession[] =>
    sessions.filter((session) => {
      const dir = session?.directory
      return typeof dir === "string" && (dir === root || dir.startsWith(`${root}${path.sep}`))
    })

  let candidates: CandidateSession[] = []
  try {
    const res = await client.session.list({ throwOnError: true })
    candidates = matches(Array.isArray(res?.data) ? res.data : [])
  } catch {
    // Fall through to the directory-scoped list below.
  }
  if (candidates.length === 0) {
    try {
      const res = await client.session.list({ query: { directory: root }, throwOnError: true })
      candidates = matches(Array.isArray(res?.data) ? res.data : [])
    } catch {
      // Return whatever the first list produced, if anything.
    }
  }
  return candidates.sort((a, b) => (b?.time?.updated ?? 0) - (a?.time?.updated ?? 0))
}

/** Read every message part for one session. */
async function readTrajectory(client: any, session: CandidateSession): Promise<TrajectoryMessage[]> {
  try {
    const res = await client.session.messages({ path: { id: session.id }, throwOnError: true })
    return Array.isArray(res?.data) ? res.data : []
  } catch {
    const res = await client.session.messages({
      path: { id: session.id },
      query: { directory: session.directory },
      throwOnError: true,
    })
    return Array.isArray(res?.data) ? res.data : []
  }
}

/** Build a compact transcript from OpenCode message parts. */
function normalizeTrajectory(messages: TrajectoryMessage[]): string {
  const lines: string[] = []
  for (const message of messages) {
    const role = message?.info?.role ?? "message"
    for (const part of message?.parts ?? []) {
      switch (part.type) {
        case "text":
          if (typeof part.text === "string" && part.text.trim()) {
            lines.push(`${role}: ${part.text.trim()}`)
          }
          break
        case "reasoning":
          if (typeof part.text === "string" && part.text.trim()) {
            lines.push(`assistant reasoning: ${part.text.trim()}`)
          }
          break
        case "tool": {
          const state = part.state ?? {}
          const status = typeof state.status === "string" ? state.status : "unknown"
          const input = summarizeJson(state.input)
          const output = typeof state.output === "string" ? state.output : summarizeJson(state.output)
          lines.push(`tool ${part.tool ?? "unknown"} status=${status}`)
          if (input) lines.push(`  input: ${truncate(input, MAX_TOOL_OUTPUT_CHARS)}`)
          if (output) lines.push(`  output: ${truncate(output, MAX_TOOL_OUTPUT_CHARS)}`)
          if (status === "error") lines.push("  is_error: true")
          break
        }
        case "file":
          if (typeof part.filename === "string") {
            lines.push(`${role} attached file: ${part.filename}`)
          }
          break
        default:
          break
      }
    }
  }
  return truncate(lines.join("\n"), MAX_TRANSCRIPT_CHARS)
}

/** Ask OpenCode itself to distill the transcript into a SKILL.md JSON object. */
async function distillTranscript(
  client: any,
  transcript: string,
  session: CandidateSession,
  targetDir: string,
): Promise<string> {
  const prompt = [
    "Distill the OpenCode session trajectory below into a reusable skill.",
    `Return one JSON object with keys: name (kebab-case, 1-64 chars), description (one sentence, 1-1024 chars), whenToUse (optional one sentence), content (Markdown body).`,
    `Source session id: ${session.id}`,
    `Source session title: ${session.title ?? "untitled"}`,
    `Target directory: ${targetDir}`,
    "The content should contain: When to use, Required context, Steps, Commands with placeholders, Pitfalls, Verification.",
    "Do not invent facts that are not in the trajectory. Remove secrets and API keys.",
  ].join("\n")

  let tempId: string | undefined
  try {
    const created = await client.session.create({
      body: { title: "opencode-skill-distill" },
      query: { directory: targetDir },
      throwOnError: true,
    })
    tempId = created?.data?.id
  } catch {
    const created = await client.session.create({ body: { title: "opencode-skill-distill" }, throwOnError: true })
    tempId = created?.data?.id
  }
  if (!tempId) throw new Error("failed to create temporary distillation session")

  try {
    const res = await client.session.prompt({
      path: { id: tempId },
      body: {
        system: SYSTEM_PROMPT,
        parts: [{ type: "text", text: `${prompt}\n\n<TRAJECTORY>\n${transcript}\n</TRAJECTORY>` }],
        tools: {},
      },
      throwOnError: true,
    })
    const parts = res?.data?.parts ?? []
    const text = parts
      .filter((part: any) => part.type === "text" && typeof part.text === "string")
      .map((part: any) => part.text)
      .join("\n")
    if (!text.trim()) throw new Error("distillation session returned no text")
    return text
  } finally {
    try {
      await client.session.delete({ path: { id: tempId }, throwOnError: true })
    } catch {
      // Best-effort cleanup of the temporary distillation session.
    }
  }
}

/** Pull the JSON object out of a model response. */
function parseDistillOutput(raw: string): {
  name: string
  description: string
  whenToUse?: string
  content: string
} {
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i) ?? raw.match(/```\s*([\s\S]*?)```/i)
  const text = fenced?.[1] ?? raw
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start < 0 || end <= start) throw new Error("distillation response did not contain a JSON object")
  const parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
  if (typeof parsed.name !== "string" || typeof parsed.description !== "string" || typeof parsed.content !== "string") {
    throw new Error("distillation JSON must contain string fields name, description, and content")
  }
  return {
    name: parsed.name,
    description: parsed.description,
    ...(typeof parsed.whenToUse === "string" && parsed.whenToUse.trim() ? { whenToUse: parsed.whenToUse } : {}),
    content: parsed.content,
  }
}

/** Validate the distilled skill and write it under skillDir/<name>/SKILL.md. */
async function writeSkill(
  skillDir: string,
  skill: { name: string; description: string; whenToUse?: string; content: string },
  source: { sessionId: string; targetDir: string },
  force: boolean,
): Promise<string> {
  const name = skill.name.trim()
  const description = skill.description.trim().replace(/\s+/g, " ")
  const content = skill.content.trim()
  if (!SKILL_NAME_RE.test(name) || name.length > 64) {
    throw new Error(`invalid skill name "${name}": use 1-64 lowercase alphanumeric chars and single hyphens`)
  }
  if (!description || description.length > DESCRIPTION_MAX_CHARS) {
    throw new Error(`invalid skill description: must be 1-${DESCRIPTION_MAX_CHARS} chars`)
  }
  if (!content) throw new Error("skill content must not be empty")

  const dir = path.join(skillDir, name)
  const file = path.join(dir, "SKILL.md")
  try {
    await access(file)
    if (!force) throw new Error(`skill "${name}" already exists at ${file}; pass force=true to overwrite`)
  } catch (error: any) {
    if (error?.code !== "ENOENT") throw error
  }

  await mkdir(dir, { recursive: true })
  const whenToUse = skill.whenToUse?.trim()
  const body = whenToUse ? `## When to use
${whenToUse.replace(/\s+/g, " ")}

${content}` : content
  const frontmatter = [
    "---",
    `name: ${yamlScalar(name)}`,
    `description: ${yamlScalar(description)}`,
    "compatibility: opencode",
    "metadata:",
    `  source-session: ${yamlScalar(source.sessionId)}`,
    `  target-dir: ${yamlScalar(source.targetDir)}`,
    `  generated: ${yamlScalar(new Date().toISOString())}`,
    "---",
    "",
    body,
    "",
  ].join("\n")
  await writeFile(file, frontmatter, "utf8")
  return file
}

export const OpencodeSkillDistill: Plugin = async ({ client }) => {
  return {
    tool: {
      opencode_sessions: tool({
        description:
          "List recent OpenCode sessions for a directory. Use this to find a session ID before distilling it with opencode_distill.",
        args: {
          target_dir: tool.schema
            .string()
            .optional()
            .describe("Directory whose OpenCode sessions should be listed. Defaults to ~/diff-dockers."),
          limit: tool.schema
            .number()
            .int()
            .min(1)
            .max(100)
            .optional()
            .describe("Maximum number of sessions to return. Defaults to 20."),
        },
        async execute(args) {
          const targetDir = expandHome(args.target_dir || DEFAULT_TARGET_DIR)
          const limit = args.limit ?? 20
          const sessions = await listCandidateSessions(client, targetDir)
          if (sessions.length === 0) {
            return `No OpenCode sessions found under ${targetDir}.`
          }
          const shown = sessions.slice(0, limit)
          const lines = shown.map((session, index) => {
            const updated = session.time?.updated ? new Date(session.time.updated).toISOString() : "unknown"
            return `${index + 1}. ${session.id}  updated=${updated}
   title=${session.title ?? "untitled"}
   directory=${session.directory ?? "unknown"}`
          })
          return `${sessions.length} session(s) under ${targetDir}; showing ${shown.length}:

${lines.join("\n")}`
        },
      }),
      opencode_distill: tool({
        description:
          "Distill a past OpenCode session trajectory into a reusable SKILL.md for OpenCode. " +
          "Use this for sessions under ~/diff-dockers. Pick a session_id, or omit to distill the latest matching session.",
        args: {
          session_id: tool.schema
            .string()
            .optional()
            .describe("OpenCode session ID to distill. Omit to pick the latest session under target_dir."),
          target_dir: tool.schema
            .string()
            .optional()
            .describe("Directory whose OpenCode sessions are candidates. Defaults to ~/diff-dockers."),
          skill_dir: tool.schema
            .string()
            .optional()
            .describe("Directory to write SKILL.md into. Defaults to ~/.config/opencode/skills."),
          skill_name: tool.schema
            .string()
            .optional()
            .describe("Optional kebab-case skill name override. If omitted the distiller proposes one."),
          force: tool.schema
            .boolean()
            .optional()
            .describe("Overwrite an existing skill directory. Defaults to false."),
        },
        async execute(args, context) {
          const targetDir = expandHome(args.target_dir || DEFAULT_TARGET_DIR)
          const skillDir = expandHome(args.skill_dir || DEFAULT_SKILL_DIR)

          const sessions = await listCandidateSessions(client, targetDir)
          if (sessions.length === 0) {
            return `No OpenCode sessions found under ${targetDir}.`
          }

          const session = args.session_id
            ? sessions.find((candidate) => candidate.id === args.session_id)
            : sessions[0]
          if (!session) {
            return `Session "${args.session_id}" was not found under ${targetDir}.`
          }

          const messages = await readTrajectory(client, session)
          if (messages.length === 0) {
            return `Session "${session.id}" has no message history.`
          }

          const transcript = normalizeTrajectory(messages)
          if (!transcript.trim()) {
            return `Session "${session.id}" produced an empty transcript; nothing to distill.`
          }

          const raw = await distillTranscript(client, transcript, session, targetDir)
          const distilled = parseDistillOutput(raw)
          if (args.skill_name) {
            distilled.name = args.skill_name.trim()
          }

          const file = await writeSkill(
            skillDir,
            distilled,
            { sessionId: session.id, targetDir },
            args.force === true,
          )

          return [
            `Distilled skill "${distilled.name}" from session "${session.title ?? session.id}".`,
            `Wrote: ${file}`,
            `Description: ${distilled.description}`,
          ].join("\n")
        },
      }),
    },
  }
}
