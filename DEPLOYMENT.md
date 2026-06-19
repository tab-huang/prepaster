# Prepaster — Deployment Runbook

Notes-to-self for deploying Prepaster (a.k.a. Crisis-to-Action). Read this top to
bottom before touching anything; the gotchas section exists because each one cost real time.

> **Do not commit real tokens here.** Fill in your own PythonAnywhere API token where
> `<YOUR_PYTHONANYWHERE_TOKEN>` appears below. Regenerate tokens at
> PythonAnywhere → Account → "API token".

---

## 1. Architecture (what is hosted where)

| Piece | Tech | Host | Public URL |
|---|---|---|---|
| Frontend | React + Vite SPA | Vercel, as a **subpath** of the `tabsite` project (whose source is the `tabite` folder) | `https://tabsite.vercel.app/usaii` |
| Backend | FastAPI (ASGI) | PythonAnywhere (free tier, uWSGI/WSGI) | `https://tabhuang2.pythonanywhere.com` |

- The frontend calls the backend cross-origin. Backend CORS is `allow_origins=["*"]`
  (`backend/app/main.py`), so no per-origin config is needed.
- The frontend is **static only** in the sense that Vercel hosts no Python; all `/api/*`
  calls go to the PythonAnywhere backend via a build-time base URL.

### Source layout
- Repo: `C:\Users\Unknown\Downloads\usaii2` (frontend in `frontend/`, backend in `backend/`).
- **The site that serves `tabsite.vercel.app` lives in `C:\Users\Unknown\Downloads\tabite`**
  (NOT `tabsite`). `tabite` is a **Vite + React app** (`vercel.json`: `framework: vite`,
  `buildCommand: npm run build`, `outputDirectory: dist`). Vercel builds it remotely.
- **Trap:** there is ALSO a `C:\Users\Unknown\Downloads\tabsite` folder. Both folders'
  `.vercel/project.json` point to the **same** Vercel project (`tabsite`,
  `prj_uo6ViDw46uKPrOh4mrwlHtgUBWeI`), but `tabsite` is an old static copy. **Always deploy
  from `tabite`.** Deploying from `tabsite` overwrites the live site with the wrong content.
- Prepaster is folded in by copying its build into **`tabite/public/usaii/`**. Vite copies
  everything in `public/` verbatim into `dist/`, so it ends up served at `/usaii`.

---

## 2. Credentials / IDs

| Thing | Value |
|---|---|
| PythonAnywhere user | `tabhuang2` |
| PythonAnywhere region | **US** (`www.pythonanywhere.com`; the EU host returns "Invalid token") |
| PythonAnywhere API token | `<YOUR_PYTHONANYWHERE_TOKEN>` |
| PA web app domain | `tabhuang2.pythonanywhere.com` (the account's **single** free web app slot) |
| PA backend dir | `/home/tabhuang2/prepaster` (contains `app/`, `.env`) |
| PA virtualenv | `/home/tabhuang2/.virtualenvs/prepaster` (Python 3.10) |
| PA WSGI file | `/var/www/tabhuang2_pythonanywhere_com_wsgi.py` |
| Vercel account | `tabisawesomet2-5809` (CLI already authenticated) |
| Vercel project | `tabsite` (linked in `tabsite/.vercel/`) |

API base for all PythonAnywhere calls:
`https://www.pythonanywhere.com/api/v0/user/tabhuang2`
Auth header: `Authorization: Token <YOUR_PYTHONANYWHERE_TOKEN>`

---

## 3. Gotchas (read these first)

1. **The free web app EXPIRES (~monthly).** When expired, the domain shows a "Coming Soon"
   page and reloads return `409`. There is **no API endpoint** to renew (`/extend/` 404s;
   PATCHing `expiry` is ignored). You must click the green **"Run until 3 months from today"**
   button at `https://www.pythonanywhere.com/user/tabhuang2/webapps/` in a browser. Only the
   user can do this. Renewal auto-reloads the app.
2. **a2wsgi hangs under uWSGI.** FastAPI is ASGI; PythonAnywhere serves WSGI. `a2wsgi`'s
   background event-loop thread does **not** survive uWSGI's prefork, so requests hang (health
   times out even though the app imports fine and the server log says "WSGI app ready"). Fix:
   the WSGI file uses a **self-contained ASGI→WSGI bridge with a fresh event loop per request**
   (full code in §5). Do NOT go back to a2wsgi.
3. **`load_dotenv()` needs an explicit path.** uWSGI chdirs to `/home/tabhuang2/`, so a bare
   `load_dotenv()` misses `prepaster/.env`. The WSGI file calls `load_dotenv("<dir>/.env")`.
4. **Console limit = 2 on free tier**, and a console must be **opened once in a browser** before
   its API `send_input` endpoint works. For backend file updates, **skip the console entirely**:
   the Files API (`POST $B/files/path/...`) can upload each file directly — run the Python loop
   in §5b-alt below. The console is only needed for fresh venv setup (§5d).
5. **Frontend subpath asset paths.** At `/usaii/`, runtime references to public files must use
   `import.meta.env.BASE_URL` (already done for `hero.mp4`, `landing/hero.jpg`, and the
   `examples/*.jpg` in `NotificationCard.jsx`). Plain `/hero.mp4` would resolve to the site root.
6. **`zip` binary isn't available** in the local shell — build archives with Python's `zipfile`.
7. **`showLanding` flag**: `frontend/src/App.jsx` has `const [showLanding] = useState(true)` to
   show the marketing landing first. Leave `true` for production.

---

## 4. Deploy the FRONTEND (Vercel `/usaii`)

Two steps: (a) build Prepaster and drop it into `tabite/public/usaii/`, (b) deploy from `tabite`.

```powershell
# (a) Build Prepaster with the backend URL + /usaii base baked in:
cd C:\Users\Unknown\Downloads\usaii2\frontend
$env:VITE_API_BASE = "https://tabhuang2.pythonanywhere.com"
npx vite build --base=/usaii/
```

```powershell
# Stage into tabite/public/usaii (PowerShell):
$src = "C:\Users\Unknown\Downloads\usaii2\frontend\dist"
$dst = "C:\Users\Unknown\Downloads\tabite\public\usaii"
if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
Copy-Item $src $dst -Recurse
```

```bash
# (b) Deploy the REAL site (tabite). Vercel runs `vite build` remotely and copies public/usaii.
cd /c/Users/Unknown/Downloads/tabite
vercel --prod --yes
```

- `VITE_API_BASE` is read by `frontend/src/api.js` (`API_BASE`, empty => same-origin for dev).
- **Deploy from `tabite`, never `tabsite`** (see §1 trap).
- `tabite/.vercelignore` ignores `/dist`, `/tabsite`, so the local `dist` is irrelevant (Vercel
  rebuilds); only `public/usaii` carries Prepaster into the output.
- Live at `https://tabsite.vercel.app` (homepage = tabite) and `https://tabsite.vercel.app/usaii`
  (Prepaster).
- If the build fails on Vite emptying `dist` locally (sandbox "protected from removal"), skip the
  local rebuild and just reuse the existing `frontend/dist` — it's already correct as long as it
  was last built with `VITE_API_BASE` + `--base=/usaii/`.

To run the app locally instead (full stack): backend `uvicorn app.main:app --reload --port 8000`,
frontend `npm run dev` (Vite proxies `/api` → :8000; no `VITE_API_BASE` needed).

---

## 5. Deploy the BACKEND (PythonAnywhere)

Everything here is driveable from the local shell via the PythonAnywhere REST API + one live
console, **except** renewing an expired web app (browser-only, see Gotcha #1).

Set up shell vars:
```bash
TOKEN="<YOUR_PYTHONANYWHERE_TOKEN>"
B="https://www.pythonanywhere.com/api/v0/user/tabhuang2"
```

### 5a. Package the backend (Python, since `zip` is missing locally)
```bash
cd C:/Users/Unknown/Downloads/usaii2/backend
python -c "
import zipfile, pathlib
out = pathlib.Path(r'C:\Users\Unknown\Downloads\usaii2\prepaster_src.zip')
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
    for p in pathlib.Path('.').rglob('*'):
        if p.is_dir(): continue
        rel = p.relative_to('.').as_posix()
        if '__pycache__' in rel or rel.endswith('.pyc') or rel.endswith('rag_monthly_cache.json'): continue
        if rel.startswith('app/') or rel in ('requirements.txt','.env'):
            z.write(p, rel)
print('done')
"
```
Includes `app/`, `requirements.txt`, and `.env` (the OpenRouter / FIRMS keys).

### 5b. Upload each file directly (preferred — no console needed)
```python
# Run with: python -c "..." from the usaii2/ directory
import zipfile, subprocess
TOKEN = "<YOUR_PYTHONANYWHERE_TOKEN>"
B = "https://www.pythonanywhere.com/api/v0/user/tabhuang2"
PA_BASE = "/home/tabhuang2/prepaster"
z = zipfile.ZipFile("prepaster_src.zip")
for name in z.namelist():
    data = z.read(name)
    pa_path = f"{PA_BASE}/{name}"
    r = subprocess.run(["curl","-s","-w","HTTP:%{http_code}","-X","POST",
        "-H",f"Authorization: Token {TOKEN}","-F",f"content=@-;filename={name}",
        f"{B}/files/path{pa_path}"], input=data, capture_output=True)
    print(r.stdout.decode().split("HTTP:")[-1].strip(), pa_path)
```
Then reload: `curl -s -X POST -H "Authorization: Token $TOKEN" "$B/webapps/tabhuang2.pythonanywhere.com/reload/"`

### 5b-alt. Upload the zip and extract via console (only for full re-setup)
```bash
curl -s -X POST -H "Authorization: Token $TOKEN" \
  -F "content=@C:/Users/Unknown/Downloads/usaii2/prepaster_src.zip" \
  "$B/files/path/home/tabhuang2/prepaster_src.zip"
```

### 5c. Find a running console
```bash
curl -s -H "Authorization: Token $TOKEN" "$B/consoles/"
```
Pick an `id` of a bash console that has been opened in a browser at least once. Call it `CID`.
`C="$B/consoles/<CID>"`. Drive it with:
- send: `curl -s -X POST -H "Authorization: Token $TOKEN" -H "Content-Type: application/json" -d '{"input":"<cmd>\n"}' "$C/send_input/"`
- read: `curl -s -H "Authorization: Token $TOKEN" "$C/get_latest_output/"`

### 5d. Unzip, build venv, install deps (in the console)
Send these (one input line; poll `get_latest_output` for the `*_DONE` markers):
```bash
rm -rf ~/prepaster ~/.virtualenvs/prepaster && mkdir -p ~/prepaster && cd ~/prepaster && unzip -oq ~/prepaster_src.zip && echo UNZIP_DONE && python3.10 -m venv ~/.virtualenvs/prepaster && echo VENV_DONE
```
then:
```bash
~/.virtualenvs/prepaster/bin/pip install -q --upgrade pip && ~/.virtualenvs/prepaster/bin/pip install fastapi==0.115.6 httpx==0.28.1 openai==1.59.6 pydantic==2.10.4 python-dotenv==1.0.1 && echo PIP_DONE
```
Note: **uvicorn and a2wsgi are NOT needed** — the WSGI bridge drives the ASGI app directly with
only the stdlib + the app's own deps.

### 5e. Write the WSGI file (Files API)
Write this exact content to `/var/www/tabhuang2_pythonanywhere_com_wsgi.py` (POST it as a file
to `$B/files/path/var/www/tabhuang2_pythonanywhere_com_wsgi.py`):

```python
# Prepaster backend on PythonAnywhere.
# Self-contained ASGI->WSGI bridge: a fresh event loop per request, so there is no
# background thread to be lost across uWSGI's prefork (which made a2wsgi hang).
import sys, asyncio
from http import HTTPStatus
from dotenv import load_dotenv

PROJECT = "/home/tabhuang2/prepaster"
if PROJECT not in sys.path:
    sys.path.insert(0, PROJECT)

# uWSGI chdirs to ~, so a bare load_dotenv() would miss it.
load_dotenv(f"{PROJECT}/.env")

from app.main import app as asgi_app


def application(environ, start_response):
    try:
        length = int(environ.get("CONTENT_LENGTH") or 0)
    except (TypeError, ValueError):
        length = 0
    body_in = environ["wsgi.input"].read(length) if length else b""

    headers = []
    for k, v in environ.items():
        if k.startswith("HTTP_"):
            headers.append((k[5:].replace("_", "-").lower().encode("latin-1"), v.encode("latin-1")))
    if environ.get("CONTENT_TYPE"):
        headers.append((b"content-type", environ["CONTENT_TYPE"].encode("latin-1")))
    if length:
        headers.append((b"content-length", str(length).encode("latin-1")))

    scope = {
        "type": "http", "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1", "method": environ["REQUEST_METHOD"],
        "scheme": environ.get("wsgi.url_scheme", "http"),
        "path": environ.get("PATH_INFO", ""),
        "raw_path": environ.get("PATH_INFO", "").encode("latin-1"),
        "query_string": environ.get("QUERY_STRING", "").encode("latin-1"),
        "root_path": "", "headers": headers,
        "server": (environ.get("SERVER_NAME", ""), int(environ.get("SERVER_PORT") or 80)),
        "client": (environ.get("REMOTE_ADDR", "127.0.0.1"), 0),
    }

    msgs = [{"type": "http.request", "body": body_in, "more_body": False}]
    resp = {"status": 500, "headers": [], "body": bytearray()}

    async def receive():
        return msgs.pop(0) if msgs else {"type": "http.disconnect"}

    async def send(m):
        if m["type"] == "http.response.start":
            resp["status"] = m["status"]; resp["headers"] = m.get("headers", [])
        elif m["type"] == "http.response.body":
            resp["body"] += m.get("body", b"")

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(asgi_app(scope, receive, send))
    finally:
        loop.close()

    try:
        phrase = HTTPStatus(resp["status"]).phrase
    except ValueError:
        phrase = "OK"
    start_response(f"{resp['status']} {phrase}",
                   [(k.decode("latin-1"), v.decode("latin-1")) for k, v in resp["headers"]])
    return [bytes(resp["body"])]
```

### 5f. Point the web app at Prepaster (API)
```bash
curl -s -X PATCH -H "Authorization: Token $TOKEN" -H "Content-Type: application/json" \
  -d '{"source_directory":"/home/tabhuang2/prepaster","virtualenv_path":"/home/tabhuang2/.virtualenvs/prepaster"}' \
  "$B/webapps/tabhuang2.pythonanywhere.com/"
```
(This repurposes the single web app slot; the old `cmuncapp` files stay on disk but stop serving.)

### 5g. Renew if expired, then reload
- Check: `curl -s -H "Authorization: Token $TOKEN" "$B/webapps/tabhuang2.pythonanywhere.com/" | python -m json.tool` → look at `expiry`.
- If `expiry` is in the past: **user clicks "Run until 3 months from today"** in the browser.
- Reload: `curl -s -X POST -H "Authorization: Token $TOKEN" "$B/webapps/tabhuang2.pythonanywhere.com/reload/"`
  - `200` = reloaded. `409` = a reload is in progress or it's expired — wait / renew, or click
    the green **Reload** button on the Web tab.

### 5h. Logs (when something breaks)
- Server log (worker startup, "WSGI app ready", 502 causes):
  `$B/files/path/var/log/tabhuang2.pythonanywhere.com.server.log`
- Error log (Python tracebacks, outbound HTTP):
  `$B/files/path/var/log/tabhuang2.pythonanywhere.com.error.log`

### Redeploying backend code changes
Re-run 5a → 5b, then in the console:
`cd ~/prepaster && unzip -oq ~/prepaster_src.zip && echo OK`, then reload (5g). No need to
rebuild the venv unless `requirements.txt` changed.

---

## 6. Verify end-to-end

```bash
# Backend health (keys loaded?)
curl -s "https://tabhuang2.pythonanywhere.com/api/health"
# -> {"ok":true,"ai_configured":true,"firms_configured":true}

# CORS allows the Vercel origin
curl -s -D - -o /dev/null -H "Origin: https://tabsite.vercel.app" \
  "https://tabhuang2.pythonanywhere.com/api/health" | grep -i access-control-allow-origin
# -> access-control-allow-origin: *

# Full demo pipeline
curl -s -X POST "https://tabhuang2.pythonanywhere.com/api/alert" \
  -H "Content-Type: application/json" \
  -d '{"lat":40.015,"lon":-105.2705,"demo":true,"hazard":"flood","tier":"ACT"}'
# -> {"ok":true,"situation":{...}}

# Frontend
curl -s -o /dev/null -w "%{http_code}\n" "https://tabsite.vercel.app/usaii/"   # -> 200
```

Then open `https://tabsite.vercel.app/usaii`, Launch, and run **Demo mode**.

---

## 7. Routine maintenance
- **~Monthly:** the user renews the PythonAnywhere web app (Gotcha #1). Current expiry was set to
  `2026-07-16`. Without renewal the backend goes dark and the deployed app's live/demo/AI features
  fail (frontend landing still loads fine since it's static on Vercel).
- Frontend changes → redeploy via §4. Backend changes → §5 "Redeploying backend code changes".
