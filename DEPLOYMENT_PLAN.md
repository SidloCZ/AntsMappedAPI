# AntsMappedAPI: Deployment & Repository Privacy Strategy Plan

This document details the roadmap for packaging and deploying AntsMappedAPI to Hugging Face Spaces, along with strategic decision frameworks regarding open-source exposure, proprietary asset protection, and Git history sanitization.

---

## 1. Key Strategic Questions: Repository Exposure & Privacy

Right now, the entire backend (`services/antmaps/`), compiled database (`data/ant_distribution.db`), and database build scripts (`build_full_database.py`) have already been committed and pushed to `origin/main` on GitHub.

Before proceeding with deployment, consider the following key questions:

### Question 1: What model of service do you want to operate?

* **Model A: Fully Open Source (Current state in Git)**
  * *What is exposed:* Everything (rendering engine, compiled database, build scripts, web portal).
  * *Pros:* Maximum community adoption, transparency, and research trust. Easy for others to audit, contribute, or self-host if your server is down.
  * *Cons:* Anyone can clone the compiled database and rendering code to run their own competing service.
  * *Context:* The underlying raw scientific data (GABI, Wong et al.) is already publicly published under Open Access (CC BY 4.0). What you built is the aggregation pipeline, sub-national polygon geometry, and rapid Matplotlib map generator.

* **Model B: Hosted API & Public Portal Only (Proprietary / Managed Service)**
  * *What is public:* Web portal (`docs/` for GitHub Pages), API documentation, client code snippets (Discord bots, Python, JS).
  * *What is private:* Cartographic engine (`services/`), compiled database (`data/`), data compilation scripts (`build_full_database.py`), and raw data.
  * *Pros:* You control 100% of the API traffic, branding, caching, and core intellectual property. Users interact with the service strictly via `https://sidlocz-antsmappedapi.hf.space`.
  * *Cons:* Requires splitting the repository or making the existing repo private and launching a dedicated public docs/client repository.

* **Model C: Open Server, Private Build Pipeline (Hybrid)**
  * *What is public:* API server (`option_2b_image_api`), renderer (`services/`), and compiled database (`data/`) so community members can self-host.
  * *What is private:* The raw dataset ETL pipeline (`build_full_database.py`, raw AntMaps CSVs, internal tools).
  * *Pros:* Balances open-source developer goodwill with keeping your source data pipeline proprietary.

---

### Question 2: If restricting exposure, how should Git history be handled?

Because `data/ant_distribution.db`, `build_full_database.py`, and `services/` are already in git commits `2d92a32` through `9761612` on `origin/main`:

* **Approach 1: Split Repositories (Recommended if going Private/Managed)**
  1. Make the current repository (`SidloCZ/AntsMappedAPI`) **Private** on GitHub.
  2. Use this private repo for backend development, database builds, and Hugging Face deployment.
  3. Create a clean, separate **Public** repository (e.g. `SidloCZ/antsmapped-portal` or `SidloCZ/antsmapped-docs`) containing only `docs/` and public documentation for GitHub Pages.
  * *Benefit:* Zero risk of broken git histories, no force-pushes, completely clean separation of concerns.

* **Approach 2: In-Place Git History Scrubbing (Destructive)**
  1. Use `git-filter-repo` to permanently purge sensitive files (`build_full_database.py`, `DOKUMENTACE_DATABAZE_A_PUBLIKACE.md`, etc.) from all past commits.
  2. Force-push (`git push --force origin main`).
  * *Warning:* Rewrites all commit hashes. Anyone who already cloned the repository will have desynchronized histories.

---

## 2. Technical Deployment Roadmap (Hugging Face Spaces)

Regardless of whether the repository is public, private, or hybrid, the API server needs to be packaged and deployed to Hugging Face Spaces:

### Phase 1: Repository Hygiene & Staging Baseline

- [ ] **1.1 License & Metadata:**
  - Add standard MIT [LICENSE](LICENSE) in project root (if remaining open source).
- [ ] **1.2 Clean Unstaged Changes:**
  - Review `.gitignore` (confirm ignoring `Work/` and runtime caches).
  - Verify minor label correction in [services/antmaps/renderer.py](services/antmaps/renderer.py).
  - Stage Google verification HTML ([docs/googlec340ab66b3914181.html](docs/googlec340ab66b3914181.html)) and SVG assets in [logo/](logo).

---

### Phase 2: Packaging the API Server for Hugging Face

- [ ] **2.1 Dependency Specification (`requirements.txt`):**
  - Pin minimal core dependencies:
    ```text
    fastapi>=0.115.0
    uvicorn[standard]>=0.30.0
    matplotlib>=3.9.0
    ```
- [ ] **2.2 Unified Entry Point (`app.py`):**
  - Create a root [app.py](app.py) that imports the FastAPI application instance from `option_2b_image_api.api_server`.
  - Resolve paths to `data/ant_distribution.db` and `data/bentities_geometry.json` relative to project root regardless of execution directory.
  - Read port dynamically from environment (`PORT` env var with default `7860`).
- [ ] **2.3 Hugging Face Space Configuration (Docker):**
  - Create a lightweight [Dockerfile](Dockerfile) using `python:3.12-slim`.
  - Setup standard non-root user `user` (UID 1000) as mandated by Hugging Face Docker spaces.
  - Set `MPLCONFIGDIR=/tmp/matplotlib` for writable Matplotlib font caching in read-only/non-root containers.
  - Copy `data/`, `services/`, `option_2b_image_api/`, and `app.py`.
  - Expose port `7860` and run `uvicorn app:app --host 0.0.0.0 --port 7860 --workers 2`.

---

### Phase 3: Local Container & Endpoint Verification

- [ ] **3.1 Local Execution Test:**
  - Run the server locally on port `7860`:
    ```powershell
    python -m uvicorn app:app --port 7860
    ```
- [ ] **3.2 Automated Endpoint Smoke Test:**
  - `GET http://localhost:7860/health`: Verify `{"status": "healthy", "database_available": true}`.
  - `GET http://localhost:7860/map/Lasius_niger.png?proj=equal_earth&theme=dark`: Verify valid PNG response headers and binary content.
  - `GET http://localhost:7860/map/genus/Formica.png`: Verify genus aggregation works without timeout.
  - `GET http://localhost:7860/api/v1/search?q=formica`: Verify JSON array response.
  - `GET http://localhost:7860/api/v1/citations`: Verify scientific attribution payload.

---

### Phase 4: Hugging Face Space Setup & Deployment

- [ ] **4.1 Create Space on Hugging Face:**
  - Name: `SidloCZ/antsmappedapi` (matches `sidlocz-antsmappedapi.hf.space`).
  - Space SDK: `Docker` (Blank template).
- [ ] **4.2 Git Remote or Automated Sync:**
  - Add Hugging Face git remote:
    ```bash
    git remote add space https://huggingface.co/spaces/SidloCZ/antsmappedapi
    ```
  - Verify database file size: `data/ant_distribution.db` is 12.7 MB and `bentities_geometry.json` is 1.15 MB (well under HF 100 MB regular git limit).
  - Push branch to Space remote.
- [ ] **4.3 Build & Startup Monitoring:**
  - Check build logs on Hugging Face Spaces interface to confirm package installations and container start.

---

### Phase 5: Live Integration & Verification

- [ ] **5.1 Test Live HF URL:**
  - Execute live requests against `https://sidlocz-antsmappedapi.hf.space/health` and `/map/Formica_picea.png`.
- [ ] **5.2 Verify GitHub Pages Web Portal:**
  - Open [docs/index.html](docs/index.html).
  - Switch API server mode in the explorer UI from "Demo (Pre-rendered)" to "Live API (Hugging Face)".
  - Search for non-cached species (e.g. *Tapinoma erraticum*) and verify that live PNG rendering loads dynamically.
- [ ] **5.3 Update Documentation:**
  - Update [README.md](README.md) status badge indicating the live server is operational.

