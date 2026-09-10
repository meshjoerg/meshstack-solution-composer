import base64
import json
from typing import Any
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="meshStack Solution Composer Local Adapter")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200", "http://127.0.0.1:4200"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

GITHUB_API = "https://api.github.com"


class GitConnection(BaseModel):
    repository: str
    branch: str = "main"
    token: str
    repoPath: str = Field(min_length=1)


class GitSaveRequest(GitConnection):
    blueprint: dict[str, Any]
    terraform: str


class GitLoadRequest(GitConnection):
    pass


def normalize_repository(value: str) -> str:
    value = value.strip().rstrip("/")
    if value.endswith(".git"):
        value = value[:-4]

    if value.startswith("http://") or value.startswith("https://"):
        parsed = urlparse(value)
        if parsed.hostname not in {"github.com", "www.github.com"}:
            raise HTTPException(status_code=400, detail="Prototype Git adapter currently supports github.com repositories only.")
        value = parsed.path.strip("/")

    parts = [part for part in value.split("/") if part]
    if len(parts) != 2:
        raise HTTPException(status_code=400, detail="Repository must be in owner/repository form or a github.com repository URL.")
    return f"{parts[0]}/{parts[1]}"


def normalize_repo_path(value: str) -> str:
    value = value.strip().strip("/")
    if not value:
        raise HTTPException(status_code=400, detail="Repository path must not be empty.")
    if any(part in {"", ".", ".."} for part in value.split("/")):
        raise HTTPException(status_code=400, detail="Repository path contains an invalid segment.")
    return value


def github_headers(token: str) -> dict[str, str]:
    if not token.strip():
        raise HTTPException(status_code=400, detail="Git repository token is missing.")
    return {
        "Authorization": f"Bearer {token.strip()}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "meshstack-solution-composer-prototype",
    }


async def github_request(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    token: str,
    *,
    json_body: dict[str, Any] | None = None,
    allow_404: bool = False,
) -> httpx.Response | None:
    response = await client.request(method, url, headers=github_headers(token), json=json_body)
    if allow_404 and response.status_code == 404:
        return None
    if response.is_error:
        try:
            payload = response.json()
            message = payload.get("message", response.text)
        except Exception:
            message = response.text or response.reason_phrase
        raise HTTPException(status_code=502, detail=f"GitHub API: {message}")
    return response


async def load_content_file(
    client: httpx.AsyncClient,
    repository: str,
    branch: str,
    token: str,
    path: str,
    *,
    optional: bool = False,
) -> tuple[str, str | None]:
    response = await github_request(
        client,
        "GET",
        f"{GITHUB_API}/repos/{repository}/contents/{path}?ref={branch}",
        token,
        allow_404=optional,
    )
    if response is None:
        return "", None

    payload = response.json()
    if payload.get("type") != "file" or payload.get("encoding") != "base64":
        raise HTTPException(status_code=502, detail=f"Unexpected GitHub content response for {path}.")

    try:
        raw = base64.b64decode(payload["content"]).decode("utf-8")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not decode {path}: {exc}") from exc
    return raw, payload.get("sha")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/git/load")
async def git_load(request: GitLoadRequest) -> dict[str, Any]:
    repository = normalize_repository(request.repository)
    repo_path = normalize_repo_path(request.repoPath)
    branch = request.branch.strip() or "main"

    async with httpx.AsyncClient(timeout=20.0) as client:
        blueprint_raw, _ = await load_content_file(
            client,
            repository,
            branch,
            request.token,
            f"{repo_path}/blueprint.json",
        )
        terraform, _ = await load_content_file(
            client,
            repository,
            branch,
            request.token,
            f"{repo_path}/main.tf",
            optional=True,
        )
        ref_response = await github_request(
            client,
            "GET",
            f"{GITHUB_API}/repos/{repository}/git/ref/heads/{branch}",
            request.token,
        )

    try:
        blueprint = json.loads(blueprint_raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail=f"blueprint.json is not valid JSON: {exc}") from exc

    return {
        "blueprint": blueprint,
        "terraform": terraform or None,
        "commitSha": ref_response.json()["object"]["sha"] if ref_response else None,
    }


@app.post("/git/save")
async def git_save(request: GitSaveRequest) -> dict[str, Any]:
    repository = normalize_repository(request.repository)
    repo_path = normalize_repo_path(request.repoPath)
    branch = request.branch.strip() or "main"
    blueprint_path = f"{repo_path}/blueprint.json"
    terraform_path = f"{repo_path}/main.tf"

    blueprint_text = json.dumps(request.blueprint, indent=2, ensure_ascii=False) + "\n"

    async with httpx.AsyncClient(timeout=20.0) as client:
        ref_response = await github_request(
            client,
            "GET",
            f"{GITHUB_API}/repos/{repository}/git/ref/heads/{branch}",
            request.token,
        )
        head_sha = ref_response.json()["object"]["sha"]

        commit_response = await github_request(
            client,
            "GET",
            f"{GITHUB_API}/repos/{repository}/git/commits/{head_sha}",
            request.token,
        )
        base_tree_sha = commit_response.json()["tree"]["sha"]

        blueprint_blob = await github_request(
            client,
            "POST",
            f"{GITHUB_API}/repos/{repository}/git/blobs",
            request.token,
            json_body={"content": blueprint_text, "encoding": "utf-8"},
        )
        terraform_blob = await github_request(
            client,
            "POST",
            f"{GITHUB_API}/repos/{repository}/git/blobs",
            request.token,
            json_body={"content": request.terraform, "encoding": "utf-8"},
        )

        tree_response = await github_request(
            client,
            "POST",
            f"{GITHUB_API}/repos/{repository}/git/trees",
            request.token,
            json_body={
                "base_tree": base_tree_sha,
                "tree": [
                    {
                        "path": blueprint_path,
                        "mode": "100644",
                        "type": "blob",
                        "sha": blueprint_blob.json()["sha"],
                    },
                    {
                        "path": terraform_path,
                        "mode": "100644",
                        "type": "blob",
                        "sha": terraform_blob.json()["sha"],
                    },
                ],
            },
        )

        identifier = str(request.blueprint.get("identifier") or request.blueprint.get("name") or "solution")
        new_commit_response = await github_request(
            client,
            "POST",
            f"{GITHUB_API}/repos/{repository}/git/commits",
            request.token,
            json_body={
                "message": f"Update solution {identifier} from meshStack Solution Composer",
                "tree": tree_response.json()["sha"],
                "parents": [head_sha],
            },
        )
        new_commit_sha = new_commit_response.json()["sha"]

        await github_request(
            client,
            "PATCH",
            f"{GITHUB_API}/repos/{repository}/git/refs/heads/{branch}",
            request.token,
            json_body={"sha": new_commit_sha, "force": False},
        )

    return {
        "commitSha": new_commit_sha,
        "files": [blueprint_path, terraform_path],
    }
