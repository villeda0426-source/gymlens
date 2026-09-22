#!/usr/bin/env python3
"""Validate the reviewed Buzz source and create reproducible local artifacts."""

from pathlib import Path
import hashlib
import io
import json
import re
import subprocess
import zipfile


def body(path: Path) -> str:
    content = path.read_text()
    if content.startswith("---\n"):
        _, _, content = content.split("---", 2)
    return content.strip()


def main() -> None:
    here = Path(__file__).resolve().parent
    pack = here / "pack"
    repo = here.parents[2]
    manifest = json.loads((pack / ".plugin/plugin.json").read_text())
    version = manifest["version"]
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise ValueError("Expected a numeric major.minor.patch version")
    persona = pack / manifest["personas"][0]
    if f'version: "{version}"' not in persona.read_text().split("---", 2)[1]:
        raise ValueError("Persona and manifest versions differ")

    validation = subprocess.run(
        ["buzz", "pack", "validate", str(pack)], check=True, capture_output=True, text=True
    )
    inspection = subprocess.run(
        ["buzz", "pack", "inspect", str(pack)], check=True, capture_output=True, text=True
    )
    print(validation.stdout.strip())

    skill = pack / "skills/spotlift-developer"
    prompt_parts = [
        f"SpotLift Developer — reviewed candidate {version}",
        body(persona),
        body(pack / "instructions.md"),
        body(skill / "SKILL.md"),
        body(skill / "references/codebase.md"),
        body(skill / "references/learning.md"),
    ]
    prompt = "\n\n".join(prompt_parts) + "\n"
    # Flatten local skill links for the paste-only workflow. Evaluation fixtures
    # remain in source and must not be represented as installed host files.
    prompt = re.sub(r"\[([^\]]+)\]\(references/[^)]+\)", r"\1", prompt)
    prompt += "\nThe evaluation cases are included in the source pack; locate that pack if needed. Do not assume it was installed by pasting this prompt.\n"

    # Explicit allowlist prevents credentials, local session state, or unrelated
    # repository files from entering a distributable archive.
    source_paths = [
        ".plugin/plugin.json", "agents/spotlift-developer.persona.md",
        "instructions.md", "CHANGELOG.md", "skills/spotlift-developer/SKILL.md",
        "skills/spotlift-developer/references/codebase.md",
        "skills/spotlift-developer/references/evaluation.md",
        "skills/spotlift-developer/references/learning.md",
    ]
    buffer = io.BytesIO()
    sources = {}
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for rel in sorted(source_paths):
            path = pack / rel
            if path.is_symlink() or not path.resolve().is_relative_to(pack.resolve()):
                raise ValueError(f"Unsafe source path: {rel}")
            data = path.read_bytes()
            sources[rel] = hashlib.sha256(data).hexdigest()
            info = zipfile.ZipInfo(rel, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data)

    name = f"spotlift-developer-{version}.buzzpack"
    archive_bytes = buffer.getvalue()
    digest = hashlib.sha256(archive_bytes).hexdigest()
    readme = (
        f"SpotLift Developer {version} — local review candidate\n\n"
        "Paste BUZZ_SYSTEM_PROMPT.txt into Buzz's new/edit agent instructions.\n"
        "The .buzzpack is source, NOT a Desktop agent-import snapshot.\n"
        "No agent was created, updated, uploaded, or behavior-tested by this build.\n"
        "The source package does not contain credentials or application data.\n"
        "Select the intended repository and confirm tools in Buzz.\n"
        "See SENIOR_REVIEW.md for findings and remaining acceptance work.\n"
    )
    artifacts = {
        name: archive_bytes,
        name + ".sha256": f"{digest}  {name}\n".encode(),
        "BUZZ_SYSTEM_PROMPT.txt": prompt.encode(),
        "README.txt": readme.encode(),
        "SENIOR_REVIEW.md": (here / "SENIOR_REVIEW.md").read_bytes(),
        "SOURCE_HASHES.json": (json.dumps(sources, indent=2) + "\n").encode(),
    }
    out = repo / "outputs/spotlift-developer-buzz" / version
    # Check the whole set before writing, so a same-version collision cannot
    # partly replace an existing artifact set.
    for rel, data in artifacts.items():
        target = out / rel
        if target.exists() and target.read_bytes() != data:
            raise FileExistsError(f"Version already has different contents: {target}; bump version")
    out.mkdir(parents=True, exist_ok=True)
    for rel, data in artifacts.items():
        (out / rel).write_bytes(data)
    # These local diagnostics can contain absolute paths; keep outside the pack.
    (out / "VALIDATION.txt").write_text(validation.stdout + validation.stderr + "\n" + inspection.stdout)
    print(f"Created {out}")
    print(f"Archive SHA-256: {digest}")
    print(f"System prompt: {len(prompt.encode())} bytes")


if __name__ == "__main__":
    main()
