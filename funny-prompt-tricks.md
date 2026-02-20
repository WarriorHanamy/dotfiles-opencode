Insight: man-made 'plan' mode, postfix to append to your prompt prevents GLM hullucination.

---

Just in BUILD mode of opencode, no need to switch to PLAN. we ask for plan manually by adding these postfix to your prompt:

Postfix: show your plan before edit.

For example, edit function X to make it faster, show your plan before edit.

Effect:

GLM will first show a its plan in text, then it will proceed to edit without user interference.

The plan is not for the user, but for GLM itself. 

Tech detail: LLM have no hidden states except previous context! by outputing a detailed text plan before outputing code, it literally 'locks' what to do for the future code generation.

here, the plan chunk act as a 'thinking' context, making the 'edit' more concentrated, less likely to hullucinate.

The built-in thinking is oftenly too rush, not enough context for GLM to making a detailed plan. However, when user explicit asking 'output a plan before edit'. GLM would use the 'thinking' tokens to think for a plan, and try its best to present a high-quality text plan, try to make it suitable for human reading. while thinking tokens are oftenly not. this plan provides a more clear guidence to following code generation, preventing code generation from shifting in-the-middle-way.

---

Postfix: show your plan, no edit.

For example, I want to wrap this web app into an electron app, show your plan.

Effect:

GLM will show a detailed plan to you, then stop, asking your agreement.

You say "proceed" or raise issues, ask for changing the plan. and GLM continue to edit.

This is to confirm GLM is fully aligned with your mind. I constantly finding I have said ambiguity words, or GLM being extending my plan way too much, into purely flaw.

also times am I realized my idea was actually not even feasible after GLM shows plan, so I can cancel the plan after realized that.

By PAUSE, let me confirming, correcting dynamically in conversation, before plan execute: I prevented unmature ideas being overinterpreted by GLM, avoids wasting time producing tons of code not matching my will.

---

Bad: I want X function in Y module. (no 'plan' postfix in prompt)

GLM could:

1. execute edit directly, but the edit can be off from your intent.
2. first show you a plan, findings. get into this good branch purely by chance.

You totally have no control over it. You don't even know if GLM will execute the edit in this round.

---

Insight: when requesting changes:

1. provide context, e.g. I'm making frontend design / doing prompt engineering. 'workflow' can have different meaning in prompt engineering and frontend.
2. what you've already done in the codebase (manually or by vibe coding).

This prevents GLM from misunderstanding your intent.

Good: I'm doing prompt engineering, I created a brainstorm agent system prompt: @agent/brainstorm.md . I notice that the brainstorm agent tends to not executing read-only commands exploring my local environment to gather information, instead it tends to ask me about information (e.g. are you using linux or windows? ubuntu or archlinux?), which is bad. I need to inform it that I permit it to run read-only bash commands to understand existing project codebase and computer environment, as long as not modifying them. how can I write concise prompt to convey these intents

GLM understand my intent: my role is act as a prompt engineer, the user ask me to edit the system prompt of a 'brainstorm' agent..

Bad: @agent/brainstorm.md make it not asking me OS information, discover OS information automatically.

GLM could think: do you want me to roleplay the brainstorm agent? Ok, I won't asking you about OS information in this conversation! let me run uname -a to get your OS information now..

---

Insight: Use a list of 'impretive' verbs.

a clear step by step guide makes GLM easy to follow, no ambiguity, no overinterpretation.

only speak of related context in prompt, no additionally adding anything could confusing GLM.

Bad: I want to remove the X function, since xxx is reluctant, no longer used in Y and Z module, since we can always use X2 instead.

Good: remove the X function in Y module. check for references of symbol X.

An extensive example of 'a list of impretive verbs' is defining a workflow, as I done in agent/executor.md and skills/tdd-workflow/SKILL.md. a strict steps to follow, is way better than tons technical preach.

'superpowers' and 'oh-my-opencode' (totally hype, I uninstalled it in 1 day) are great bad examples in my view of prompt engineering - see https://github.com/obra/superpowers/blob/main/skills/test-driven-development/SKILL.md, it write tons of 'iron raw', 'ALL CAPITCAL', fancy memraids, but never define a clear steps for LLM to follow - totally self perceived preaching, as if a talkative stupid professor is preaching a human fellow, tons of shits wasting your tokens.

If your only got a blurry idea, cannot form a clear list of steps in your mind:

first talk with GLM to brainstorm, prompt it to discuss possbility and feasibility only, not execute.

when idea is clearified, ask GLM to create a list of steps in impretive mood (with 'show the list of steps, no execute' postfix). then you confirm these steps, and say 'execute.'

This would be way more effcient than directly tell GLM the idea to execute without discussing to produce a concrete list of steps.

---

Insight: why not try: human write code, AI reviews

actually I find LLM preforms code review very well. it always catch my bugs that I didn't even notice, points out undefinied behaviors in C++, English grammar issues and typos.

as a contrast, asking LLM writing code with domain-specific knowledge is constantly filled with hullucinatation, need taken very carefully.

actually some statistics shows that programers take 80% of their time in testing and debugging loop, not in writing code. writing code is strightforward (at least for most ACM winners), validation is the bottleneck, while code review and testing are the two main steps for validating code quality.

no 'shame' to insist write code manually in the age of 'AI hype', especially for code requiring highly skilled domain knowledge. by writing code yourself, verifying with AI, you are actually speeding up the '80%' of work time with AI power!

---

Insight: create a fresh conversation for each request, no "Middle Ages Auntie's Foot Wrap".

...
