from __future__ import annotations

import platform
from pathlib import Path


ROOT = Path(__file__).resolve().parent


def quote_exec_argument(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def main() -> int:
    if platform.system() != "Linux":
        print("Este atalho automático é para o menu de aplicativos do Linux.")
        print("No Windows, abra start-local.bat para iniciar o app.")
        return 0

    applications = Path.home() / ".local" / "share" / "applications"
    applications.mkdir(parents=True, exist_ok=True)
    shortcut = applications / "sua-voz-linkedin.desktop"
    runner = str(ROOT / "start_local.py")
    icon = str(ROOT / "static" / "icon.svg")
    contents = "\n".join(
        (
            "[Desktop Entry]",
            "Version=1.0",
            "Type=Application",
            "Name=Seu ateliê de escrita",
            "Comment=Abra seu espaço pessoal para escrever no LinkedIn",
            f"Exec=/usr/bin/env python3 {quote_exec_argument(runner)}",
            f"Icon={icon}",
            "Terminal=true",
            "Categories=Office;Network;",
            "StartupNotify=true",
            "",
        )
    )
    shortcut.write_text(contents, encoding="utf-8")
    shortcut.chmod(shortcut.stat().st_mode | 0o111)
    print(f"Atalho criado no menu de aplicativos: {shortcut}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
