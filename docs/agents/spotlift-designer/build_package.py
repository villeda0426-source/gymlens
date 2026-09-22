#!/usr/bin/env python3
"""Validate the SpotLift Designer pack and write a paste-ready Buzz system prompt."""
from pathlib import Path
import json, re, shutil, subprocess


def body(p: Path) -> str:
    t = p.read_text()
    return t.split("---", 2)[2].strip() if t.startswith("---\n") else t.strip()


def main() -> None:
    here = Path(__file__).resolve().parent
    pack, repo = here / "pack", here.parents[2]
    version = json.loads((pack / ".plugin/plugin.json").read_text())["version"]
    persona = pack / "agents/spotlift-designer.persona.md"
    if f'version: "{version}"' not in persona.read_text():
        raise SystemExit("Persona and manifest versions differ")
    if shutil.which("buzz"):
        print(subprocess.run(["buzz", "pack", "validate", str(pack)], check=True, capture_output=True, text=True).stdout.strip())
    else:
        print("buzz CLI not on PATH; skipped pack validation")
    skill = pack / "skills/spotlift-designer"
    parts = [f"SpotLift Designer {version}", body(persona), body(pack / "instructions.md"), body(skill / "SKILL.md")]
    parts += [body(skill / "references" / f) for f in ("brand.md", "craft.md", "handoff.md")]
    prompt = re.sub(r"\[([^\]]+)\]\(references/[^)]+\)", r"\1 (below)", "\n\n".join(parts)) + "\n"
    out = repo / "outputs/spotlift-designer-buzz" / version
    out.mkdir(parents=True, exist_ok=True)
    (out / "BUZZ_SYSTEM_PROMPT.txt").write_text(prompt)
    print(f"Wrote {out / 'BUZZ_SYSTEM_PROMPT.txt'} ({len(prompt.split())} words)")


if __name__ == "__main__":
    main()
