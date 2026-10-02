# Setup

Run the Career Intelligence Assistant with Docker Compose. You need [Docker](https://docs.docker.com/get-docker/) (with Compose v2) and an Ollama API key.

## 1. Get an Ollama API key

<!-- TODO: add instructions for getting an Ollama API key -->

## 2. Configure the backend

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`:

- `BASIC_AUTH_USERNAME` / `BASIC_AUTH_PASSWORD`: the login the browser asks for. Change them from the defaults.
- `OLLAMA_API_KEY`: the key from step 1.
- `OLLAMA_MODEL`: the chat model (default `gemma4:31b`).

You can leave the embedding and database settings alone. Compose points the backend at its own Ollama container and keeps the database in a volume.

## 3. Start it

From the repository root:

```bash
docker compose up -d --build
```

This starts four services:

| Service | What it does | Address |
| --- | --- | --- |
| `frontend` | The built UI served by `vite preview`, which proxies `/api` to the backend | http://localhost:4173 |
| `backend` | The API, with the SQLite database in the `data` volume | http://localhost:3000 (docs at `/swagger`) |
| `ollama` | Local Ollama for embeddings (Ollama's cloud API cannot embed) | http://localhost:11434 |
| `pull-embedding-model` | One-off job that downloads `nomic-embed-text`, then exits | |

The first run downloads the embedding model, so it takes a few minutes. The backend waits until the model is downloaded before it starts.

Open http://localhost:4173 and sign in with the `BASIC_AUTH_*` values from `backend/.env`.

## Day to day

```bash
docker compose logs -f backend    # follow the backend logs
docker compose up -d --build      # rebuild after pulling changes or editing backend/.env
docker compose down               # stop; the database and model stay in volumes
docker compose down -v            # stop and delete the database and model
```

If a port is in use, change it with `FRONTEND_PORT`, `BACKEND_PORT` or `OLLAMA_PORT`, for example `FRONTEND_PORT=8080 docker compose up -d`.

## Troubleshooting

- **Adding a job fails with "Could not index the job".** The embedding model is not available. Check `docker compose logs pull-embedding-model`, then run `docker compose up -d` again to retry the download.
- **Chat replies fail.** Check `OLLAMA_API_KEY`, `OLLAMA_BASE_URL` and `OLLAMA_MODEL` in `backend/.env`, then run `docker compose up -d` so the backend picks up the changes.
- **The browser keeps asking for the login.** The credentials don't match `backend/.env`.

For local development without Docker, see the Frontend and Backend sections of [README.md](README.md).
