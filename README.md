# Career Intelligence Assistant

## Spec

Build a system that analyzes resumes against job descriptions. Upload a resume and multiple job postings, then answer questions about:

- Fit
- Skill gaps
- Experience alignment
- Interview preparation

### Example queries

- "What skills am I missing for this role?"
- "How does my experience align with Job #2?"

## Systems Diagram

[Excalidraw: resume-chatbot](https://excalidraw.com/resume-chatbot)

## Development

Built using Typescript, with React for the frontend and Hono for the backend. SQLite for the database and TBD on the AI provider.

# Frontend

Simple React chat frontend, using Shadcn/UI components with Tanstack for rapid development.

# Backend

Hono used for a lightweight, edge supported runtime. Using Drizzle for the ORM with SQLite to keep the environment simple, Hono basic auth and TBD on AI provider.


# Deployment

Initially focusing on local environment only, but will attempt to natively support Cloudflare with reasonable abstractions.
