# Cloud Agent Skill: Running & Testing the WFM Dashboard

> **When to use this skill:** When a Cloud agent needs to set up, run, or test
> any part of this codebase — including first-time environment setup, launching
> the Streamlit app, uploading data, validating forecasts/staffing, or running
> automated tests.

---

## 1  Quick-Start Setup

```bash
# From the workspace root (/workspace)
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

> **Cloud VM note:** If `python3 -m venv` fails with "ensurepip is not
> available", run `sudo apt-get install -y python3.12-venv` first (adjust
> version to match `python3 --version`).

There is no `.env` file, no Docker, no database, and no external service
dependency. All computation is local.

### Python version

The codebase uses `pd.DataFrame | None` union syntax, which requires
**Python 3.10+**.

---

## 2  Running the App

```bash
# Start the Streamlit dev server (default port 8501)
streamlit run app.py --server.headless true
```

`--server.headless true` prevents Streamlit from trying to open a browser
(important in headless Cloud agent VMs). The app will be reachable at
`http://localhost:8501`.

### Verifying the app started

After launching, look for the line:

```
You can now view your Streamlit app in your browser.
```

You can also `curl -s -o /dev/null -w '%{http_code}' http://localhost:8501`
— a `200` confirms readiness.

---

## 3  Authentication & Feature Flags

- **Auth:** None. There is no login, API key, or credentials required. The app
  is open to anyone who can reach the port.
- **Feature flags:** None in code. All runtime behaviour is controlled via UI
  widgets (forecast model, staffing model, AHT, service level, etc.). There are
  no env-var-based toggles.
- **Streamlit config:** Lives in `.streamlit/config.toml`. Theme colours,
  max upload size (200 MB), and usage-stats opt-out are set there. No changes
  are needed to run or test.

---

## 4  Codebase Layout

Everything lives in a single file, `app.py`, with these logical sections:

| Section | Lines (approx) | What it does |
|---|---|---|
| **CSS & config** | 1–102 | Page config, custom CSS, colour map, Plotly defaults |
| **Data loading** | 104–145 | `load_and_validate` — reads CSV/XLSX, normalises columns, requires `created_at` |
| **Arrival pattern** | 148–184 | `build_arrival_pattern` — hour × day-of-week average volume pivot |
| **Forecasting** | 188–263 | Holt-Winters, ARIMA, Moving Average helpers + `forecast_arrival_pattern` |
| **Staffing** | 266–372 | Erlang-C and Simple Productivity HC calculation + `compute_hc_table` |
| **Charts** | 375–429 | Plotly heatmap, bar chart, and weekly-total helpers |
| **Main UI** | 432–740 | `main()` — upload widget, sidebar params, tabs, download buttons |

---

## 5  Testing Workflows by Area

### 5.1  Data Loading (`load_and_validate`)

**Automated (unit-style):**

```python
import pandas as pd, io

# Create a minimal CSV in memory
csv_data = "created_at,team\n2024-01-15 08:30:00,Support\n2024-01-15 14:00:00,Sales\n"

class FakeFile:
    name = "test.csv"
    def read(self): return csv_data.encode()

# Bypass Streamlit by calling internals directly
df = pd.read_csv(io.StringIO(csv_data))
df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]
assert "created_at" in df.columns
df["created_at"] = pd.to_datetime(df["created_at"])
assert len(df) == 2
```

**Manual (GUI):**

1. Start the app (`streamlit run app.py --server.headless true`).
2. Open `http://localhost:8501` in the browser (use `computerUse` subagent).
3. Upload a CSV with a `created_at` column — verify KPI cards populate.
4. Upload a file *without* `created_at` — verify the red error banner appears.

### 5.2  Arrival Pattern (`build_arrival_pattern`)

**Automated:**

```python
from app import build_arrival_pattern
import pandas as pd

dates = pd.date_range("2024-01-01", periods=168, freq="h")  # 1 week
df = pd.DataFrame({"created_at": dates, "team": "A"})
pattern = build_arrival_pattern(df)

assert pattern.shape == (24, 7), "Should have 24 hours × 7 days"
assert (pattern >= 0).all().all(), "No negative volumes"
```

### 5.3  Forecasting (`forecast_arrival_pattern`)

**Automated:**

```python
from app import build_arrival_pattern, forecast_arrival_pattern
import pandas as pd

dates = pd.date_range("2024-01-01", periods=720, freq="h")  # 30 days
df = pd.DataFrame({"created_at": dates, "team": "A"})
arrival = build_arrival_pattern(df)

for model in ("hw", "arima", "wma"):
    fc = forecast_arrival_pattern(arrival, model_key=model)
    assert fc.shape == arrival.shape
    assert (fc >= 0).all().all(), f"Model {model} produced negatives"
```

### 5.4  Staffing / HC (`compute_hc_table`)

**Automated:**

```python
from app import compute_hc_table
import pandas as pd, numpy as np

fake_forecast = pd.DataFrame(
    np.full((24, 7), 50.0),
    index=[f"{h:02d}:00" for h in range(24)],
    columns=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"],
)

hc_erlang = compute_hc_table(fake_forecast, staffing_model="erlang_c")
hc_prod   = compute_hc_table(fake_forecast, staffing_model="productivity")

assert (hc_erlang > 0).all().all()
assert (hc_prod > 0).all().all()
```

### 5.5  Full End-to-End (GUI)

1. Generate a sample CSV:

   ```bash
   python3 -c "
   import pandas as pd
   dates = pd.date_range('2024-01-01', periods=2000, freq='h')
   df = pd.DataFrame({'created_at': dates, 'team': 'Support'})
   df.to_csv('/tmp/sample_wfm.csv', index=False)
   "
   ```

2. Start the app in a tmux session:

   ```bash
   SESSION_NAME="streamlit-app"
   tmux -f /exec-daemon/tmux.portal.conf new-session -d -s "$SESSION_NAME" -- \
       bash -lc "cd /workspace && source .venv/bin/activate && streamlit run app.py --server.headless true"
   ```

3. Use the `computerUse` subagent to:
   - Open `http://localhost:8501`.
   - Upload `/tmp/sample_wfm.csv`.
   - Verify all four tabs render (Arrival Pattern, Forecasted Volume, HC
     Required, Visual Insights).
   - Switch forecast model to ARIMA — verify the forecast table updates.
   - Switch staffing model to Simple Productivity — verify HC table updates.
   - Click the download buttons — verify files download.

---

## 6  Creating Sample Test Data

The app needs a CSV/Excel file with at least a `created_at` datetime column.
An optional `team` column enables team filtering.

```bash
python3 -c "
import pandas as pd, numpy as np
rng = np.random.default_rng(42)
n = 5000
dates = pd.date_range('2024-01-01', periods=n, freq='h')
teams = rng.choice(['Support', 'Sales', 'Billing'], size=n)
pd.DataFrame({'created_at': dates, 'team': teams}).to_csv('/tmp/sample_wfm.csv', index=False)
print('Wrote /tmp/sample_wfm.csv')
"
```

---

## 7  Common Pitfalls

| Issue | Fix |
|---|---|
| `ModuleNotFoundError` for any dependency | Run `pip install -r requirements.txt` inside the venv. |
| Port 8501 already in use | Kill the old Streamlit process or pass `--server.port 8502`. |
| Streamlit tries to open a browser | Add `--server.headless true`. |
| ARIMA model warnings | These are suppressed by the `warnings.filterwarnings("ignore")` at module level; safe to ignore. |
| Upload resets on code change | Streamlit hot-reloads on file save, which clears `st.file_uploader` state. Re-upload after changes. |

---

## 8  Keeping This Skill Up to Date

When you discover a new testing trick, environment workaround, or runbook-style
fix while working in this codebase, **add it here** so future agents benefit:

1. **New pitfall or workaround** → add a row to the *Common Pitfalls* table
   (Section 7).
2. **New test snippet** → add it under the matching subsection in
   *Testing Workflows* (Section 5), or create a new subsection (e.g. 5.6) if
   the area is not yet covered.
3. **New dependency or setup step** → update Section 1 (Quick-Start Setup).
4. **Automated test framework adopted** → add a *Running the Test Suite*
   section between Sections 5 and 6, documenting the framework and commands
   (e.g. `pytest tests/ -v`).
5. **CI pipeline added** → add a section describing how to read CI results and
   common failure modes.

Keep entries concise and action-oriented. Each entry should tell an agent
*what to do*, not just *what happened*.
