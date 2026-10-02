# Prompts

System prompts live here as versioned markdown files: `prompts/<name>/<version>.md`
(for example `prompts/chat/v1.md`). Nothing is overwritten: to change a prompt, add the
next version and point the config at it.

- `config/prompts.json` chooses the active version of each prompt. The server will not
  start if an active version does not exist.
- `PROMPT_CHAT_VERSION=v1` in the environment overrides the config for the chat prompt,
  which is handy for trying a version or rolling back without editing files.
- A leading `<!-- ... -->` comment is for humans (say what changed) and is stripped before use.
- Every assistant reply is stored with the version that produced it (`messages.prompt_version`,
  for example `chat@v1`), so answers can be compared across versions.

## The chat prompt contract

The server appends the user's documents after the prompt text, in a fixed format that the
prompt can rely on. The resume is sent whole. Each job is a short summary plus the excerpts
(requirements) retrieved for the latest question (the chat prompt expects this):

    <resume name="...">full resume text</resume>
    <job number="1" name="...">
    <summary>short summary of the posting</summary>
    <excerpts>
    What we are looking for
    Strong Go and PostgreSQL experience.

    What you will do
    ...another relevant requirement...
    </excerpts>
    </job>
    <job number="2" name="..."> same shape </job>

There is no fallback to full job postings for chat: if the embedding model is unavailable the
message is rejected with an error instead. Scoring sends the full text of both documents
(`<resume name="...">full text</resume>`, `<job number="1" name="...">full text</job>`).

Jobs are numbered in the order the user chose them. Chats created before resumes and jobs
existed get the prompt text alone. Keep the prompt consistent with these formats.

The `summary` prompt writes the short summary that goes with each job posting.
