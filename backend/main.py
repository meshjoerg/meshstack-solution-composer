from fastapi import FastAPI

app = FastAPI(title="meshStack Solution Composer Local Adapter")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
