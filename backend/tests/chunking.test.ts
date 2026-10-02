import { describe, expect, it } from 'vitest'
import { ChunkingService } from '../src/services/chunking.js'

const chunking = new ChunkingService()

describe('chunkJob', () => {
  it('makes one chunk per requirement, labelled with its section', () => {
    const chunks = chunking.chunkJob(`Senior Backend Engineer – Northwind

Northwind builds payment infrastructure.

What you will do
- Design services in Go.
- Mentor two engineers.

What we are looking for
- 5+ years of backend work.
- Strong Go and PostgreSQL.
- Experience with Kafka
  or similar systems.

Details
Hybrid in Manchester. Salary £75,000 – £90,000.`)

    expect(chunks.map((c) => c.label)).toEqual([
      'Overview',
      'What you will do',
      'What you will do',
      'What we are looking for',
      'What we are looking for',
      'What we are looking for',
      'Details',
    ])
    expect(chunks[1]!.text).toBe('What you will do\nDesign services in Go.')
    // a wrapped line stays with its bullet
    expect(chunks[5]!.text).toBe('What we are looking for\nExperience with Kafka or similar systems.')
  })

  it('understands markdown headings and numbered lists', () => {
    const chunks = chunking.chunkJob(`# Platform Engineer

## Requirements

1. Kubernetes in production.
2. Terraform.

## Nice to have

* Healthcare experience.`)

    // the title stays as a small overview chunk, since the role name is useful context
    expect(chunks.map((c) => `${c.label}: ${c.text.split('\n')[1]}`)).toEqual([
      'Overview: Platform Engineer',
      'Requirements: Kubernetes in production.',
      'Requirements: Terraform.',
      'Nice to have: Healthcare experience.',
    ])
  })

  it('splits a requirements section written as sentences', () => {
    const chunks = chunking.chunkJob(`Frontend Developer

Requirements:
You have 4+ years of professional frontend work. You know React and TypeScript well. Accessibility experience is a plus.`)

    const requirements = chunks.filter((c) => c.label === 'Requirements')
    expect(requirements).toHaveLength(3)
    expect(requirements[1]!.text).toContain('React and TypeScript')
  })

  it('falls back to a single overview for an unstructured posting', () => {
    const chunks = chunking.chunkJob('We need an engineer who likes hard problems and works well in a small team.')
    expect(chunks).toHaveLength(1)
    expect(chunks[0]!.label).toBe('Overview')
  })

  it('returns nothing for empty text', () => {
    expect(chunking.chunkJob('')).toEqual([])
  })
})
