# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

Single-file Python/Streamlit WFM (Workforce Management) dashboard (`app.py`) for volume arrival analysis and forecasting. No database, no backend API, no Docker — fully self-contained.

### Running the app

```bash
streamlit run app.py --server.headless true --server.port 8501
```

The app serves at `http://localhost:8501`. Use the sidebar to generate sample data or upload a CSV/Excel file.

### Dependencies

All Python deps are in `requirements.txt`. Install with `pip install -r requirements.txt`.

**Gotcha:** `jinja2` is required at runtime by pandas' `.style` accessor (used for styled dataframes) but is not listed in `requirements.txt`. It is pulled in transitively by Streamlit, but if you see `AttributeError: The '.style' accessor requires jinja2`, run `pip install --user --force-reinstall jinja2`.

### Lint / Test / Build

- **No automated test suite** exists in this repo.
- **No linter config** (e.g. ruff, flake8, pylint) is committed. You can run `python3 -m py_compile app.py` as a basic syntax check.
- **No build step** — Streamlit apps run directly from source.

### Config

Streamlit theme and server settings are in `.streamlit/config.toml` (dark theme, 200 MB upload limit, XSRF protection on, usage stats off).
