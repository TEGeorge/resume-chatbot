# Prompts

System prompts live here as versioned markdown files: `prompts/<name>/<version>.md`
(for example `prompts/chat/v2.md`). Nothing is overwritten: to change a prompt, add the
next version and point the config at it.

- `config/prompts.json` chooses the active version of each prompt. The server will not
  start if an active version does not exist.
- `PROMPT_CHAT_VERSION=v1` in the environment overrides the config for the chat prompt,
  which is handy for trying a version or rolling back without editing files.
- A leading `<!-- ... -->` comment is for humans (say what changed) and is stripped before use.
- Every assistant reply is stored with the version that produced it (`messages.prompt_version`,
  for example `chat@v2`), so answers can be compared across versions.

## The chat prompt contract

The server appends the user's documents after the prompt text, in a fixed format that the
prompt can rely on:

    <resume name="...">CV text</resume>
    <job number="1" name="...">posting text</job>
    <job number="2" name="...">posting text</job>

Jobs are numbered in the order the user chose them. Chats created before CVs and jobs
existed get the prompt text alone. Keep the prompt consistent with this format.
