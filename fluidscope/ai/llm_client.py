"""Unified LLM client supporting Offline, Google Gemini (google-genai), and OpenAI-Compatible APIs."""

from __future__ import annotations

import json
import os
from typing import Any
import httpx

from fluidscope.ai.schemas import LLMConfig


def call_llm_json(system_prompt: str, user_prompt: str, cfg: LLMConfig) -> tuple[dict[str, Any] | None, str, str | None]:
    """Attempt structured JSON completion; return (parsed_dict_or_None, provider_tag, fallback_note)."""
    provider = cfg.provider
    if provider == "offline":
        return None, "offline_deterministic", None

    if provider == "gemini":
        key = cfg.api_key.strip() or os.environ.get("GEMINI_API_KEY", "").strip()
        if not key:
            return None, "offline_fallback", "No Gemini API key provided; used offline deterministic engine."
        try:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=key)
            model_name = cfg.model.strip() or "gemini-2.5-flash"
            resp = client.models.generate_content(
                model=model_name,
                contents=f"{system_prompt}\n\nUSER INPUT:\n{user_prompt}",
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.1,
                ),
            )
            data = json.loads(resp.text)
            return data, f"gemini:{model_name}", None
        except Exception as exc:
            return None, "offline_fallback", f"Gemini fallback ({exc})"

    # OpenAI / Groq / OpenRouter / Ollama compatible endpoint
    url = cfg.base_url.rstrip("/") + "/chat/completions"
    key = cfg.api_key.strip() or os.environ.get("OPENAI_API_KEY", "").strip() or "ollama"
    model_name = cfg.model.strip() or "gpt-4o-mini"
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    payload = {
        "model": model_name,
        "temperature": 0.1,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }
    try:
        with httpx.Client(timeout=20.0) as client:
            r = client.post(url, headers=headers, json=payload)
            r.raise_for_status()
            content = r.json()["choices"][0]["message"]["content"]
            return json.loads(content), f"openai_compat:{model_name}", None
    except Exception as exc:
        return None, "offline_fallback", f"OpenAI-compatible fallback ({exc})"

