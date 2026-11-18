"""Pydantic schemas enforcing strict AI-to-Solver data contracts."""

from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field


PhysicsFamily = Literal[
    "kinematics_equation",
    "vortex_flow",
    "rotating_vessel",
    "potential_superposition",
    "falkner_skan",
    "bl_separation",
    "couette_poiseuille",
    "two_layer_poiseuille",
    "slip_herschel_bulkley",
    "hydraulic_jump",
    "sudden_expansion",
    "accelerating_tank",
    "lbm_tunnel",
    "unsupported_3d",
]


class GeometryPrimitive(BaseModel):
    type: Literal["circle", "rect", "splitter", "step"]
    x: float = Field(default=0.25, ge=0.02, le=0.95)
    y: float = Field(default=0.50, ge=0.05, le=0.95)
    r: float = Field(default=0.10, ge=0.03, le=0.35)
    x0: float = Field(default=0.30, ge=0.02, le=0.95)
    y0: float = Field(default=0.45, ge=0.02, le=0.95)
    x1: float = Field(default=0.55, ge=0.05, le=0.98)
    y1: float = Field(default=0.55, ge=0.05, le=0.98)


class ParsedPhysicsQuery(BaseModel):
    family: PhysicsFamily
    confidence: float = Field(default=0.9, ge=0.0, le=1.0)
    parser_mode: str = "offline_deterministic"
    assumptions: dict[str, bool] = Field(default_factory=dict)
    params: dict[str, Any] = Field(default_factory=dict)
    obstacles: list[GeometryPrimitive] = Field(default_factory=list)
    concept_twist: str
    broken_shortcut: str
    textbook_ref: str
    unsupported_reason: str | None = None
    raw_query: str = ""


class LLMConfig(BaseModel):
    provider: Literal["offline", "gemini", "openai_compatible"] = "offline"
    api_key: str = ""
    model: str = ""
    base_url: str = "https://api.openai.com/v1"


class DoubtCoachReply(BaseModel):
    answer: str
    grounded_facts: list[str] = Field(default_factory=list)
    textbook_citation: str
    provider_used: str

