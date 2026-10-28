from __future__ import annotations

import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
import venv
import webbrowser
from pathlib import Path


ROOT = Path(__file__).resolve().parent
ENV_DIR = ROOT / ".venv"
PORT = 8080
APP_URL = f"http://127.0.0.1:{PORT}"


def python_in_environment() -> Path:
    if sys.platform == "win32":
        return ENV_DIR / "Scripts" / "python.exe"
    return ENV_DIR / "bin" / "python"


def prepare_environment() -> Path:
    if sys.version_info < (3, 11):
        raise RuntimeError("Instale Python 3.11 ou mais recente para abrir o app.")
    system_python = Path(sys.executable)
    system_has_crypto = subprocess.run(
        [str(system_python), "-c", "import cryptography"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    ).returncode == 0
    if system_has_crypto:
        return system_python

    python = python_in_environment()
    if ENV_DIR.exists():
        available = subprocess.run(
            [str(python), "-c", "import cryptography"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        ).returncode == 0
        if available:
            return python
        shutil.rmtree(ENV_DIR)
    if not python.exists():
        print("Preparando o app para uso local…")
        try:
            venv.create(ENV_DIR, with_pip=True)
        except subprocess.CalledProcessError as exc:
            raise RuntimeError("Instale o pacote python3-venv do seu Python para preparar o app.") from exc
    available = subprocess.run(
        [str(python), "-c", "import cryptography"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    ).returncode == 0
    if not available:
        print("Instalando o componente necessário para proteger a conexão do LinkedIn…")
        subprocess.run(
            [str(python), "-m", "pip", "install", "--disable-pip-version-check", "-r", str(ROOT / "requirements-local.txt")],
            check=True,
        )
    return python


def app_is_running() -> bool:
    try:
        with urllib.request.urlopen(f"{APP_URL}/health", timeout=1) as response:
            return response.status == 200 and b'"ok": true' in response.read(256)
    except (urllib.error.URLError, TimeoutError):
        return False


def open_window() -> None:
    webbrowser.open(APP_URL)


def main() -> int:
    try:
        python = prepare_environment()
    except (OSError, subprocess.CalledProcessError, RuntimeError) as exc:
        print(f"Não consegui preparar o app: {exc}", file=sys.stderr)
        return 1

    if app_is_running():
        print("O app já está aberto; levando você até ele.")
        open_window()
        return 0

    environment = os.environ.copy()
    environment.pop("PORT", None)
    environment["APP_BIND"] = "127.0.0.1"
    environment["APP_PORT"] = str(PORT)
    process = subprocess.Popen([str(python), str(ROOT / "app.py")], cwd=ROOT, env=environment)
    for _ in range(60):
        if process.poll() is not None:
            print("O app fechou antes de iniciar. Confira a mensagem acima.", file=sys.stderr)
            return process.returncode or 1
        if app_is_running():
            print("App pronto. Esta janela mantém o serviço local ativo; feche-a para encerrar.")
            open_window()
            try:
                return process.wait()
            except KeyboardInterrupt:
                process.terminate()
                try:
                    return process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    return process.wait()
        time.sleep(0.5)

    process.terminate()
    print("O app demorou demais para iniciar. Tente abri-lo novamente.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
