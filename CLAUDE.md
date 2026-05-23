# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

This repository is currently empty — it contains only `LICENSE` (MIT) and a placeholder `README.md`. There is no source code, build configuration, package manifest, or test suite yet.

Implied scope from the repository name: a system for running darts tournaments (brackets, scoring, player/match management). Nothing about language, framework, or architecture has been chosen yet — defer those decisions to the user rather than assuming.

## When starting work here

- Before adding code, confirm with the user the intended stack (language, framework, persistence, frontend/backend split) and tournament rules in scope (501/301, cricket, leg/set format, knockout vs. round-robin, etc.). These choices drive everything downstream.
- Once a stack is chosen and an initial scaffold lands, update this file with the actual build/lint/test commands and the high-level architecture. Replace this "Repository status" section with real content — don't leave it as a placeholder.

## Branching

Per the active task configuration, development happens on `claude/claude-md-docs-jz5nd` (and similarly named feature branches). `main` is the default branch on the remote (`danielfrengl/darts-tournament-system`).
