from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler

from app import init_db, run_scheduler_once


init_db()


class handler(BaseHTTPRequestHandler):
    def log_message(self, _format: str, *_args) -> None:
        return

    def do_GET(self) -> None:
        secret = os.environ.get("CRON_SECRET", "")
        if not secret or self.headers.get("Authorization", "") != f"Bearer {secret}":
            self.send_response(401)
            result = {"error": "Acesso não autorizado."}
        else:
            try:
                run_scheduler_once()
                self.send_response(200)
                result = {"ok": True}
            except Exception as exc:
                self.send_response(500)
                result = {"error": str(exc)[:500]}
        body = json.dumps(result, ensure_ascii=False).encode("utf-8")
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)
