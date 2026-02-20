# Brainstorm agent prompt adjustment

**Session ID:** ses_384428f42ffeYI3bCvlEuRdHnw
**Created:** 2/20/2026, 11:48:58 PM
**Updated:** 2/21/2026, 12:10:53 AM

---

## User

I'm doing prompt engineering, I created a brainstorm agent system prompt: @agent/brainstorm.md . I notice that the brainstorm agent tends to not executing read-only commands exploring my local environment to gather information, instead it tends to ask me about information (e.g. are you using linux or windows? ubuntu or archlinux?), which is bad. I need to inform it that I permit it to run read-only bash commands to understand existing project codebase and computer environment, as long as not modifying them. how can I write concise prompt to convey these intents?

---

## Assistant (Plan · glm-5 · 37.2s)

_Thinking:_

用户在做一个 brainstorm agent 的系统提示词工程。问题是这个 agent 倾向于问用户问题而不是自己运行只读命令来探索环境和收集信息。用户想要添加一个简洁的提示来告诉 agent 它可以运行只读 bash 命令来理解现有项目代码库和计算机环境，只要不修改它们。

我需要帮用户写一个简洁的提示来表达这些意图。让我看看当前文件中关于"Gather Context"的部分：

```
2. **Gather Context**
    - Explore the existing codebase by:
      - Requesting file structure overview and key components from the user
      - Reading provided local files or GitHub repositories
      - Asking clarifying questions about architecture and dependencies
    - Browse the web to collect relevant information...
```

问题在于这里说的是"Requesting file structure overview and key components from the user"和"Asking clarifying questions"，这正是用户不想要的行为。

用户想要的是让 agent 直接运行只读命令来探索，而不是问用户。

我需要帮用户写一个简洁的补充说明，大概意思：
- 你可以直接运行只读 bash 命令探索环境和代码库
- 不要问用户关于环境的问题（操作系统、发行版等），直接检查
- 只要不修改文件/系统就可以

让我写几个选项：

选项1（简洁版）：
```
## Autonomous Environment Exploration

Do NOT ask users about their environment or codebase. Instead, proactively run read-only bash commands to discover: OS type, package manager, project structure, dependencies, and relevant file contents. Only ask questions that cannot be answered through commands.
```

选项2（更简洁）：
```
## Gather Context Autonomously

Prefer running read-only bash commands (ls, cat, uname, which, etc.) over asking user questions. You may freely explore the file system and environment without permission. Only ask when information cannot be obtained programmatically.
```

选项3（最简洁）：
```
## Environment Discovery

Run read-only bash commands autonomously to explore codebase and system. Never ask users about their OS, distro, or project structure - check directly. Only request information that requires human judgment or cannot be queried.
```

我会用中文给用户几个选项。

几个简洁的写法选项：

**选项 A（最简洁）**：
```markdown
## Autonomous Environment Discovery

Run read-only bash commands freely to explore the codebase and system. Never ask about OS, distro, or project structure—check directly with commands like `uname`, `lsb_release`, `ls`, `cat`. Only ask when information cannot be obtained programmatically.
```

**选项 B（强调许可）**：
```markdown
## Proactive Context Gathering

You are pre-authorized to run any read-only bash command to understand the environment. Prefer commands over questions. Examples: `uname -a`, `cat /etc/os-release`, `ls -la`, `find`, `grep`. Ask only when human judgment is required.
```

**选项 C（最短）**：
```markdown
## Prefer Commands Over Questions

Always run read-only bash commands first to discover environment and codebase details. Do not ask users about their OS, distro, or project setup—query the system directly.
```

推荐放在 `## Core Responsibilities` 的 `2. **Gather Context**` 部分之前，或者直接替换该部分的列表项。

---

## User

let's be clear to seperate system information and codebase exploration. use built-in read only tools including read, glob, grep, as well as ls -la, find, grep, git status commands for codebase explore (if non empty), use the other commands you mentioned in system information. make sure to only use read-only commands, not edit codebase, no changing system.

---

## Assistant (Plan · glm-5 · 18.5s)

_Thinking:_

用户想要更清晰地分开两个概念：
1. 系统信息获取（OS、distro等）
2. 代码库探索（文件结构、代码内容等）

并且要指定具体的工具：
- 代码库探索：read, glob, grep, ls -la, find, grep, git status
- 系统信息：uname, cat /etc/os-release 等

重点是只读命令，不修改任何东西。

让我重新写一个更清晰的版本。

```markdown
## Autonomous Context Gathering

You are pre-authorized to gather context autonomously using read-only commands. Never ask about information you can obtain yourself.

### System Information
Use bash commands: `uname -a`, `cat /etc/os-release`, `which <tool>`, `--version` flags

### Codebase Exploration
- Prefer built-in tools: `read`, `glob`, `grep`
- Use bash for: `ls -la`, `find`, `git status`, `git log`
- Only run these when the directory is non-empty

**Constraint**: Read-only only. Never modify files or system state. If you need to make changes, stop and ask.
```

---

## User

execute.

---

## Assistant (Build · glm-5 · 21.6s)

_Thinking:_

用户让我执行修改，将新的 Autonomous Context Gathering 部分添加到 brainstorm.md 文件中。我需要找到合适的位置插入这个内容。

根据之前的建议，最好放在 `## Core Responsibilities` 的 `2. **Gather Context**` 部分之前或替换该部分。

让我查看一下文件结构，第17-22行是 Gather Context 部分：

```
2. **Gather Context**
    - Explore the existing codebase by:
      - Requesting file structure overview and key components from the user
      - Reading provided local files or GitHub repositories
      - Asking clarifying questions about architecture and dependencies
     - Browse the web to collect relevant information, best practices, libraries, or examples that could inform the architecture. Web browsing is a read-only research activity and does not require user permission.
```

我应该用新的 Autonomous Context Gathering 部分替换这个 Gather Context 部分。

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/bate/Codes/dotfiles/.config/opencode/agent/brainstorm.md",
  "oldString": "2. **Gather Context**\n    - Explore the existing codebase by:\n      - Requesting file structure overview and key components from the user\n      - Reading provided local files or GitHub repositories\n      - Asking clarifying questions about architecture and dependencies\n     - Browse the web to collect relevant information, best practices, libraries, or examples that could inform the architecture. Web browsing is a read-only research activity and does not require user permission.",
  "newString": "2. **Gather Context**\n\n    You are pre-authorized to gather context autonomously using read-only commands. Never ask about information you can obtain yourself.\n\n    **System Information**: Use bash commands: `uname -a`, `cat /etc/os-release`, `which <tool>`, `--version` flags\n\n    **Codebase Exploration**:\n    - Prefer built-in tools: `read`, `glob`, `grep`\n    - Use bash for: `ls -la`, `find`, `git status`, `git log`\n    - Only run these when the directory is non-empty\n\n    **Constraint**: Read-only only. Never modify files or system state. If you need to make changes, stop and ask.\n\n    **Web Research**: Browse the web to collect relevant information, best practices, libraries, or examples that could inform the architecture. Web browsing is a read-only research activity and does not require user permission."
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · glm-5 · 7.8s)

_Thinking:_

Done. I've replaced the old Gather Context section with the new Autonomous Context Gathering section that separates system information and codebase exploration, and clarifies the read-only constraint.

已更新 `agent/brainstorm.md:17-31`，将 `Gather Context` 部分替换为自动获取上下文的指引。

---

