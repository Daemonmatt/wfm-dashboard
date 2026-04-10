"""
WFM Volume Arrival, Forecasting & Staffing Dashboard
=====================================================
A Streamlit-based WFM analytics dashboard that:
  1. Accepts uploaded data with a `created_at` column
  2. Builds an hourly arrival-pattern table (Hour rows × Day-of-week columns)
  3. Forecasts volume using selectable models (Holt-Winters, ARIMA, Moving Average)
  4. Calculates headcount (HC) required via Erlang-C or a simple productivity model

Author: WFM Analytics Engine
"""

import streamlit as st
import pandas as pd
import numpy as np
import plotly.graph_objects as go
from plotly.subplots import make_subplots
from datetime import datetime, timedelta
from statsmodels.tsa.holtwinters import ExponentialSmoothing
from scipy.special import factorial as _factorial
import warnings
import math
import io

warnings.filterwarnings("ignore")

# ─────────────────────────────────────────────────────────────
# PAGE CONFIG & CSS
# ─────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="WFM Arrival, Forecast & Staffing",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="expanded",
)

CUSTOM_CSS = """
<style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
    html, body, [class*="css"] { font-family: 'Inter', sans-serif; }

    .main-header {
        background: linear-gradient(135deg, #0F172A 0%, #1E3A5F 50%, #334155 100%);
        padding: 1.8rem 2rem; border-radius: 12px; margin-bottom: 1.5rem;
        border: 1px solid rgba(59,130,246,0.2);
        box-shadow: 0 4px 24px rgba(0,0,0,0.3);
    }
    .main-header h1 { color: #F1F5F9; font-size: 1.8rem; font-weight: 700; margin: 0; }
    .main-header p  { color: #94A3B8; font-size: 0.95rem; margin: 0.3rem 0 0 0; }

    .metric-card {
        background: linear-gradient(145deg, #1E293B, #0F172A);
        border: 1px solid rgba(59,130,246,0.15); border-radius: 10px;
        padding: 1.2rem 1.4rem; text-align: center;
        box-shadow: 0 2px 12px rgba(0,0,0,0.2);
    }
    .metric-card:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(59,130,246,0.15); }
    .metric-card .metric-value { font-size: 2rem; font-weight: 700; color: #3B82F6; }
    .metric-card .metric-label { font-size: 0.8rem; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 0.3rem; }

    .section-header { color: #E2E8F0; font-size: 1.15rem; font-weight: 600;
        border-left: 3px solid #3B82F6; padding-left: 0.8rem; margin: 1.5rem 0 0.8rem 0; }

    .info-box { background: rgba(59,130,246,0.08); border: 1px solid rgba(59,130,246,0.2);
        border-radius: 8px; padding: 1rem 1.2rem; margin: 0.8rem 0; font-size: 0.88rem; color: #CBD5E1; }

    .table-title { color: #E2E8F0; font-size: 1.05rem; font-weight: 600; margin: 1rem 0 0.5rem 0; }

    #MainMenu {visibility: hidden;} footer {visibility: hidden;} header {visibility: hidden;}

    [data-testid="stSidebar"] { background: linear-gradient(180deg, #0F172A 0%, #1E293B 100%); }
    [data-testid="stSidebar"] .stMarkdown h1,
    [data-testid="stSidebar"] .stMarkdown h2,
    [data-testid="stSidebar"] .stMarkdown h3 { color: #F1F5F9; }

    .stTabs [data-baseweb="tab-list"] { gap: 0.5rem; background: #1E293B; padding: 0.5rem; border-radius: 10px; }
    .stTabs [data-baseweb="tab"] { border-radius: 8px; color: #94A3B8; font-weight: 500; font-size: 0.85rem; }
    .stTabs [aria-selected="true"] { background: #3B82F6 !important; color: white !important; }
</style>
"""
st.markdown(CUSTOM_CSS, unsafe_allow_html=True)

COLORS = {
    "primary": "#3B82F6", "secondary": "#8B5CF6", "accent": "#F59E0B",
    "success": "#10B981", "danger": "#EF4444",
    "bg_dark": "#0F172A", "bg_card": "#1E293B",
    "text_primary": "#F1F5F9", "text_secondary": "#94A3B8",
    "grid_color": "rgba(148,163,184,0.08)",
}

PLOTLY_LAYOUT = dict(
    paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
    font=dict(family="Inter, sans-serif", color=COLORS["text_secondary"], size=12),
    xaxis=dict(gridcolor=COLORS["grid_color"], zerolinecolor=COLORS["grid_color"]),
    yaxis=dict(gridcolor=COLORS["grid_color"], zerolinecolor=COLORS["grid_color"]),
    margin=dict(l=50, r=30, t=50, b=50),
    hoverlabel=dict(bgcolor=COLORS["bg_card"], bordercolor=COLORS["primary"],
                    font=dict(color=COLORS["text_primary"], size=12)),
)

DAY_ORDER = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
HOUR_LABELS = [f"{h:02d}:00" for h in range(24)]

# ─────────────────────────────────────────────────────────────
# DATA LOADING & VALIDATION
# ─────────────────────────────────────────────────────────────

def load_and_validate(uploaded_file) -> pd.DataFrame | None:
    """Read uploaded file and ensure it contains a `created_at` column."""
    try:
        name = uploaded_file.name.lower()
        if name.endswith(".csv"):
            df = pd.read_csv(uploaded_file)
        elif name.endswith((".xlsx", ".xls")):
            df = pd.read_excel(uploaded_file)
        else:
            st.error("Unsupported file type. Please upload CSV or Excel.")
            return None
    except Exception as exc:
        st.error(f"Error reading file: {exc}")
        return None

    col_map = {c: c.strip().lower().replace(" ", "_") for c in df.columns}
    df.rename(columns=col_map, inplace=True)

    if "created_at" not in df.columns:
        st.error(
            "The uploaded file must contain a **created_at** column. "
            f"Found columns: {', '.join(df.columns.tolist())}"
        )
        return None

    df["created_at"] = pd.to_datetime(df["created_at"], errors="coerce")
    before = len(df)
    df.dropna(subset=["created_at"], inplace=True)
    dropped = before - len(df)
    if dropped:
        st.warning(f"Dropped {dropped} rows with un-parseable created_at values.")

    if "team" not in df.columns:
        df["team"] = "All"

    df["team"] = df["team"].astype(str).str.strip()

    return df


# ─────────────────────────────────────────────────────────────
# TABLE 1 — VOLUME ARRIVAL PATTERN
# ─────────────────────────────────────────────────────────────

def build_arrival_pattern(df: pd.DataFrame) -> pd.DataFrame:
    """
    Pivot data into an arrival-pattern table:
      rows  = Hour (00:00 – 23:00)
      cols  = Day of week (Sunday … Saturday)
      value = average volume per hour-day combination
    """
    tmp = df.copy()
    tmp["day_name"] = tmp["created_at"].dt.day_name()
    tmp["hour"] = tmp["created_at"].dt.hour

    counts = (
        tmp.groupby(["hour", "day_name"])
        .size()
        .reset_index(name="volume")
    )

    n_weeks_per_day = (
        tmp.groupby("day_name")["created_at"]
        .apply(lambda s: s.dt.date.nunique())
        .reset_index(name="n_days")
    )
    counts = counts.merge(n_weeks_per_day, on="day_name", how="left")
    counts["avg_volume"] = (counts["volume"] / counts["n_days"]).round(1)

    pivot = counts.pivot(index="hour", columns="day_name", values="avg_volume")
    pivot = pivot.reindex(columns=[d for d in DAY_ORDER if d in pivot.columns])
    pivot = pivot.reindex(range(24), fill_value=0)
    pivot.index = HOUR_LABELS
    pivot.index.name = "Hour"
    pivot = pivot.fillna(0)

    return pivot


# ─────────────────────────────────────────────────────────────
# TABLE 2 — FORECASTED VOLUME
# ─────────────────────────────────────────────────────────────

def _build_hourly_time_series(df: pd.DataFrame) -> pd.Series:
    """Build a continuous hourly volume time series from raw records."""
    tmp = df.copy()
    tmp["hour_floor"] = tmp["created_at"].dt.floor("h")
    counts = tmp.groupby("hour_floor").size()
    full_range = pd.date_range(
        start=counts.index.min(), end=counts.index.max(), freq="h",
    )
    ts = counts.reindex(full_range, fill_value=0).astype(float)
    ts.index.name = "Timestamp"
    return ts


def _forecast_hw_series(ts: pd.Series, steps: int) -> np.ndarray:
    """Holt-Winters on a continuous hourly time series."""
    vals = ts.values.astype(float)
    n = len(vals)

    if n >= 2 * 168:
        sp = 168
    elif n >= 2 * 24:
        sp = 24
    else:
        sp = None

    if sp:
        model = ExponentialSmoothing(
            vals, trend="add", seasonal="add",
            seasonal_periods=sp, initialization_method="estimated",
        )
    else:
        model = ExponentialSmoothing(
            vals, trend="add", seasonal=None,
            initialization_method="estimated",
        )
    fit = model.fit(optimized=True, use_brute=True)
    return np.maximum(fit.forecast(steps), 0)


def _forecast_arima_series(ts: pd.Series, steps: int) -> np.ndarray:
    """ARIMA on a continuous hourly time series."""
    from statsmodels.tsa.arima.model import ARIMA
    vals = ts.values.astype(float)
    model = ARIMA(vals, order=(2, 1, 2))
    fit = model.fit()
    return np.maximum(fit.forecast(steps=steps), 0)


def _forecast_wma_series(ts: pd.Series, steps: int) -> np.ndarray:
    """Weighted moving-average: repeat last week's pattern with trend adjustment."""
    vals = ts.values.astype(float)
    if len(vals) >= 168:
        last_week = vals[-168:]
        prev_week = vals[-336:-168] if len(vals) >= 336 else last_week
        growth = np.where(prev_week > 0, last_week / prev_week, 1.0)
        growth = np.clip(growth, 0.5, 2.0)
        pattern = last_week * growth
    elif len(vals) >= 24:
        pattern = vals[-24:]
    else:
        pattern = vals

    repeats = (steps // len(pattern)) + 2
    return np.maximum(np.tile(pattern, repeats)[:steps], 0)


FORECAST_MODELS = {
    "Holt-Winters (recommended)": "hw",
    "ARIMA (2,1,2)": "arima",
    "Weighted Moving Average": "wma",
}


def forecast_arrival_pattern(
    df: pd.DataFrame,
    arrival_pattern: pd.DataFrame,
    model_key: str = "hw",
) -> pd.DataFrame:
    """
    Forecast the next 168 hours (one week) from the raw data's continuous
    hourly time series, then reshape into the same Hour × Day table format.
    """
    ts = _build_hourly_time_series(df)

    if len(ts) < 48:
        return arrival_pattern.copy()

    try:
        if model_key == "hw":
            forecast_vals = _forecast_hw_series(ts, 168)
        elif model_key == "arima":
            forecast_vals = _forecast_arima_series(ts, 168)
        else:
            forecast_vals = _forecast_wma_series(ts, 168)
    except Exception:
        forecast_vals = _forecast_wma_series(ts, 168)

    last_ts = ts.index[-1]
    future_idx = pd.date_range(start=last_ts + pd.Timedelta(hours=1), periods=168, freq="h")
    forecast_series = pd.Series(forecast_vals, index=future_idx)

    forecast_df = pd.DataFrame({
        "hour": future_idx.hour,
        "day_name": future_idx.day_name(),
        "volume": np.round(forecast_vals, 1),
    })

    pivot = forecast_df.pivot_table(index="hour", columns="day_name", values="volume", aggfunc="mean")
    pivot = pivot.reindex(columns=[d for d in DAY_ORDER if d in pivot.columns])
    pivot = pivot.reindex(range(24), fill_value=0).fillna(0)
    pivot.index = HOUR_LABELS
    pivot.index.name = "Hour"

    for col in arrival_pattern.columns:
        if col not in pivot.columns:
            pivot[col] = 0.0
    pivot = pivot[[c for c in arrival_pattern.columns if c in pivot.columns]]

    return pivot.clip(lower=0).round(1)


# ─────────────────────────────────────────────────────────────
# TABLE 3 — HEADCOUNT (HC) REQUIRED
# ─────────────────────────────────────────────────────────────

def _erlang_c(n: int, a: float) -> float:
    """
    Erlang-C probability that a call must wait.
    n = number of agents, a = offered traffic (Erlangs)
    """
    if n <= 0 or a <= 0:
        return 0.0
    if n <= a:
        return 1.0
    try:
        inv_b = sum((a ** k) / math.factorial(k) for k in range(n))
        last = (a ** n) / math.factorial(n) * (n / (n - a))
        ec = last / (inv_b + last)
        return max(0.0, min(ec, 1.0))
    except (OverflowError, ZeroDivisionError, ValueError):
        return 1.0


def _erlang_c_agents(
    volume: float,
    aht_seconds: float = 300,
    service_level_target: float = 0.80,
    target_answer_time: float = 30,
    shrinkage: float = 0.30,
    interval_seconds: float = 3600,
) -> int:
    """
    Compute minimum agents needed to meet SL target using Erlang-C.
    Returns agent count including shrinkage.
    """
    if volume <= 0:
        return 0

    traffic_erlangs = (volume * aht_seconds) / interval_seconds

    agents = max(1, int(math.ceil(traffic_erlangs)))
    for n in range(agents, agents + 1000):
        ec = _erlang_c(n, traffic_erlangs)
        if n <= traffic_erlangs:
            continue
        sl = 1.0 - ec * math.exp(-(n - traffic_erlangs) * target_answer_time / aht_seconds)
        if sl >= service_level_target:
            return int(math.ceil(n / (1 - shrinkage)))

    return int(math.ceil((traffic_erlangs + 1) / (1 - shrinkage)))


def _simple_productivity_hc(
    volume: float,
    aht_minutes: float = 5.0,
    utilization: float = 0.75,
    shrinkage: float = 0.30,
) -> int:
    """Simple productivity-based HC = Volume × AHT / (60 × Utilization × (1 - Shrinkage))."""
    if volume <= 0:
        return 0
    raw = (volume * aht_minutes) / (60.0 * utilization * (1 - shrinkage))
    return int(math.ceil(raw))


STAFFING_MODELS = {
    "Erlang-C (recommended)": "erlang_c",
    "Simple Productivity Model": "productivity",
}


def compute_hc_table(
    forecast_table: pd.DataFrame,
    staffing_model: str = "erlang_c",
    aht_seconds: float = 300,
    service_level: float = 0.80,
    target_answer_time: float = 30,
    shrinkage: float = 0.30,
    utilization: float = 0.75,
) -> pd.DataFrame:
    """
    Compute HC required for every cell in the forecasted-volume table.
    """
    result = pd.DataFrame(index=forecast_table.index)
    result.index.name = "Hour"

    for day_col in forecast_table.columns:
        hc_list = []
        for vol in forecast_table[day_col].values:
            if staffing_model == "erlang_c":
                hc = _erlang_c_agents(
                    volume=vol,
                    aht_seconds=aht_seconds,
                    service_level_target=service_level,
                    target_answer_time=target_answer_time,
                    shrinkage=shrinkage,
                )
            else:
                hc = _simple_productivity_hc(
                    volume=vol,
                    aht_minutes=aht_seconds / 60.0,
                    utilization=utilization,
                    shrinkage=shrinkage,
                )
            hc_list.append(hc)
        result[day_col] = hc_list

    return result


# ─────────────────────────────────────────────────────────────
# VISUALISATION HELPERS
# ─────────────────────────────────────────────────────────────

def heatmap_figure(table: pd.DataFrame, title: str, colorscale: str = "Blues") -> go.Figure:
    """Generic heatmap from a Hour × Day pivot."""
    fig = go.Figure(data=go.Heatmap(
        z=table.values,
        x=table.columns.tolist(),
        y=table.index.tolist(),
        colorscale=colorscale,
        hovertemplate="<b>%{y} – %{x}</b><br>Value: %{z:.1f}<extra></extra>",
    ))
    fig.update_layout(
        title=dict(text=title, font=dict(size=14, color=COLORS["text_primary"])),
        height=500, yaxis=dict(autorange="reversed"),
        **PLOTLY_LAYOUT,
    )
    return fig


def comparison_bar_chart(arrival: pd.DataFrame, forecast: pd.DataFrame, day: str) -> go.Figure:
    """Side-by-side bar chart comparing actual vs forecast for a given day."""
    fig = go.Figure()
    if day in arrival.columns:
        fig.add_trace(go.Bar(
            x=arrival.index, y=arrival[day], name="Actual Avg",
            marker_color=COLORS["primary"], opacity=0.8,
        ))
    if day in forecast.columns:
        fig.add_trace(go.Bar(
            x=forecast.index, y=forecast[day], name="Forecast",
            marker_color=COLORS["accent"], opacity=0.8,
        ))
    fig.update_layout(
        title=dict(text=f"{day} — Actual vs Forecast", font=dict(size=14, color=COLORS["text_primary"])),
        barmode="group", height=380,
        **PLOTLY_LAYOUT,
    )
    return fig


def weekly_total_chart(table: pd.DataFrame, title: str, color: str) -> go.Figure:
    """Bar chart of total volume per day."""
    totals = table.sum()
    fig = go.Figure(go.Bar(
        x=totals.index, y=totals.values,
        marker_color=color, text=totals.values.round(0).astype(int),
        textposition="outside",
    ))
    fig.update_layout(
        title=dict(text=title, font=dict(size=14, color=COLORS["text_primary"])),
        height=350, **PLOTLY_LAYOUT,
    )
    return fig


# ─────────────────────────────────────────────────────────────
# MAIN APPLICATION
# ─────────────────────────────────────────────────────────────

def main():
    # ── Header ──
    st.markdown(
        """<div class="main-header">
            <h1>📊 WFM Arrival Pattern, Forecast & Staffing Dashboard</h1>
            <p>Upload data with a <code>created_at</code> column to analyse hourly arrival patterns,
            forecast volume, and calculate headcount requirements.</p>
        </div>""",
        unsafe_allow_html=True,
    )

    # ── Top filters row ──
    filter_cols = st.columns([2, 2, 2, 2])

    with filter_cols[0]:
        uploaded_file = st.file_uploader(
            "Upload Data (CSV / Excel)", type=["csv", "xlsx", "xls"],
            help="File **must** contain a `created_at` column. Optionally include a `team` column for filtering.",
        )

    with filter_cols[1]:
        forecast_model_label = st.selectbox(
            "Forecasting Model",
            list(FORECAST_MODELS.keys()),
            index=0,
        )
        forecast_model_key = FORECAST_MODELS[forecast_model_label]

    with filter_cols[2]:
        staffing_model_label = st.selectbox(
            "Staffing Model",
            list(STAFFING_MODELS.keys()),
            index=0,
        )
        staffing_model_key = STAFFING_MODELS[staffing_model_label]

    with filter_cols[3]:
        team_placeholder = st.empty()

    # ── Staffing parameters (in an expander) ──
    with st.expander("⚙️ Staffing & Forecast Parameters", expanded=False):
        pcols = st.columns(5)
        with pcols[0]:
            aht_seconds = st.number_input("AHT (seconds)", min_value=10, max_value=7200, value=300, step=10,
                                          help="Average Handle Time per contact in seconds")
        with pcols[1]:
            service_level = st.slider("Service Level Target", 0.50, 1.00, 0.80, 0.01,
                                      format="%.0f%%",
                                      help="Target percentage of calls answered within target time")
        with pcols[2]:
            target_answer_time = st.number_input("Target Answer Time (s)", min_value=5, max_value=600, value=30, step=5,
                                                  help="Target time to answer in seconds")
        with pcols[3]:
            shrinkage = st.slider("Shrinkage %", 0.0, 0.60, 0.30, 0.01, format="%.0f%%",
                                  help="Percentage of time agents are unavailable (breaks, training, etc.)")
        with pcols[4]:
            utilization = st.slider("Utilization % (productivity model)", 0.40, 1.00, 0.75, 0.01, format="%.0f%%",
                                    help="Agent productive utilization (only used in Simple Productivity model)")

    # ── Load data ──
    if uploaded_file is None:
        st.markdown(
            """<div style="text-align:center; padding:4rem 2rem;">
                <div style="font-size:4rem; margin-bottom:1rem;">📂</div>
                <h2 style="color:#E2E8F0;">Upload your data to get started</h2>
                <p style="color:#94A3B8; max-width:520px; margin:0 auto;">
                    Your file must contain a <strong>created_at</strong> column (datetime).
                    Optionally include a <strong>team</strong> column for filtering.<br><br>
                    The dashboard will:<br>
                    1️⃣ Build an hourly volume arrival-pattern table<br>
                    2️⃣ Forecast future volume using your chosen model<br>
                    3️⃣ Calculate headcount (HC) required for the forecasted volume
                </p>
            </div>""",
            unsafe_allow_html=True,
        )
        return

    df = load_and_validate(uploaded_file)
    if df is None or df.empty:
        return

    # ── Team filter ──
    teams = sorted(df["team"].unique().tolist())
    with filter_cols[3]:
        if len(teams) > 1:
            selected_team = st.selectbox("Filter by Team", ["All Teams"] + teams)
        else:
            selected_team = "All Teams"
            st.info(f"Team: {teams[0]}")

    if selected_team != "All Teams":
        df_filtered = df[df["team"] == selected_team].copy()
    else:
        df_filtered = df.copy()

    if df_filtered.empty:
        st.warning("No data for the selected team.")
        return

    # ── KPI metrics ──
    total_records = len(df_filtered)
    date_range_start = df_filtered["created_at"].min().strftime("%Y-%m-%d")
    date_range_end = df_filtered["created_at"].max().strftime("%Y-%m-%d")
    n_days = df_filtered["created_at"].dt.date.nunique()
    avg_daily = total_records / max(n_days, 1)

    mcols = st.columns(4)
    kpis = [
        (f"{total_records:,}", "Total Records"),
        (f"{n_days}", "Days of Data"),
        (f"{avg_daily:,.0f}", "Avg Daily Volume"),
        (f"{date_range_start}  →  {date_range_end}", "Date Range"),
    ]
    for col, (val, lbl) in zip(mcols, kpis):
        col.markdown(
            f'<div class="metric-card"><div class="metric-value">{val}</div>'
            f'<div class="metric-label">{lbl}</div></div>',
            unsafe_allow_html=True,
        )

    st.markdown("---")

    # ── Build the three core tables ──
    with st.spinner("Analysing arrival pattern …"):
        arrival_table = build_arrival_pattern(df_filtered)
    with st.spinner(f"Forecasting with {forecast_model_label} …"):
        forecast_table = forecast_arrival_pattern(df_filtered, arrival_table, model_key=forecast_model_key)
    with st.spinner(f"Calculating HC with {staffing_model_label} …"):
        hc_table = compute_hc_table(
            forecast_table,
            staffing_model=staffing_model_key,
            aht_seconds=aht_seconds,
            service_level=service_level,
            target_answer_time=target_answer_time,
            shrinkage=shrinkage,
            utilization=utilization,
        )

    # ── Tabs ──
    tab1, tab2, tab3, tab4 = st.tabs([
        "📋 Arrival Pattern",
        "🔮 Forecasted Volume",
        "👥 HC Required",
        "📈 Visual Insights",
    ])

    # ────────── TAB 1: Arrival Pattern ──────────
    with tab1:
        st.markdown('<div class="section-header">📋 Table 1 — Hourly Volume Arrival Pattern (Average)</div>', unsafe_allow_html=True)
        st.markdown(
            '<div class="info-box">Each cell shows the <strong>average number of contacts</strong> '
            'arriving in that hour on that day of the week, computed from the uploaded data\'s '
            '<code>created_at</code> column.</div>',
            unsafe_allow_html=True,
        )

        st.dataframe(
            arrival_table.style.format("{:.1f}").background_gradient(cmap="Blues", axis=None),
            use_container_width=True, height=670,
        )

        hm1 = heatmap_figure(arrival_table, "Arrival Pattern Heatmap", "Blues")
        st.plotly_chart(hm1, use_container_width=True, key="hm_arrival")

        col_total = arrival_table.sum()
        row_total = arrival_table.sum(axis=1)

        c1, c2 = st.columns(2)
        with c1:
            st.markdown("**Daily Totals (avg)**")
            st.dataframe(col_total.rename("Total").to_frame().T.style.format("{:.0f}"), use_container_width=True)
        with c2:
            st.markdown("**Hourly Totals (across all days)**")
            st.dataframe(row_total.rename("Total").to_frame().style.format("{:.0f}"), use_container_width=True, height=300)

        csv1 = arrival_table.to_csv()
        st.download_button("⬇️ Download Arrival Pattern CSV", csv1, "arrival_pattern.csv", "text/csv", key="dl_arr")

    # ────────── TAB 2: Forecasted Volume ──────────
    with tab2:
        st.markdown(
            f'<div class="section-header">🔮 Table 2 — Forecasted Volume ({forecast_model_label})</div>',
            unsafe_allow_html=True,
        )
        st.markdown(
            f'<div class="info-box">Forecasted hourly volume per day of week using '
            f'<strong>{forecast_model_label}</strong>. The model is fitted per-day-column on the '
            f'arrival pattern from Table 1.</div>',
            unsafe_allow_html=True,
        )

        st.dataframe(
            forecast_table.style.format("{:.1f}").background_gradient(cmap="Oranges", axis=None),
            use_container_width=True, height=670,
        )

        hm2 = heatmap_figure(forecast_table, "Forecasted Volume Heatmap", "Oranges")
        st.plotly_chart(hm2, use_container_width=True, key="hm_forecast")

        fc_total = forecast_table.sum()
        st.markdown("**Forecasted Daily Totals**")
        st.dataframe(fc_total.rename("Total").to_frame().T.style.format("{:.0f}"), use_container_width=True)

        csv2 = forecast_table.to_csv()
        st.download_button("⬇️ Download Forecast CSV", csv2, "forecasted_volume.csv", "text/csv", key="dl_fc")

    # ────────── TAB 3: HC Required ──────────
    with tab3:
        st.markdown(
            f'<div class="section-header">👥 Table 3 — Headcount Required ({staffing_model_label})</div>',
            unsafe_allow_html=True,
        )

        param_text = (
            f"AHT: {aht_seconds}s | SL Target: {service_level:.0%} | "
            f"Answer Time: {target_answer_time}s | Shrinkage: {shrinkage:.0%}"
        ) if staffing_model_key == "erlang_c" else (
            f"AHT: {aht_seconds}s | Utilization: {utilization:.0%} | Shrinkage: {shrinkage:.0%}"
        )

        st.markdown(
            f'<div class="info-box">Headcount required to handle the forecasted volume using '
            f'<strong>{staffing_model_label}</strong>.<br>'
            f'Parameters: {param_text}</div>',
            unsafe_allow_html=True,
        )

        st.dataframe(
            hc_table.style.format("{:.0f}").background_gradient(cmap="Greens", axis=None),
            use_container_width=True, height=670,
        )

        hm3 = heatmap_figure(hc_table, "HC Required Heatmap", "Greens")
        st.plotly_chart(hm3, use_container_width=True, key="hm_hc")

        hc_total = hc_table.sum()
        hc_peak = hc_table.max()
        st.markdown("**Daily HC Summary**")
        summary = pd.DataFrame({"Total HC": hc_total, "Peak HC (single hour)": hc_peak}).T
        st.dataframe(summary.style.format("{:.0f}"), use_container_width=True)

        csv3 = hc_table.to_csv()
        st.download_button("⬇️ Download HC Required CSV", csv3, "hc_required.csv", "text/csv", key="dl_hc")

    # ────────── TAB 4: Visual Insights ──────────
    with tab4:
        st.markdown('<div class="section-header">📈 Visual Insights</div>', unsafe_allow_html=True)

        # Weekly totals comparison
        c1, c2 = st.columns(2)
        with c1:
            st.plotly_chart(
                weekly_total_chart(arrival_table, "Average Daily Volume (Arrival Pattern)", COLORS["primary"]),
                use_container_width=True, key="wk_arr",
            )
        with c2:
            st.plotly_chart(
                weekly_total_chart(forecast_table, "Forecasted Daily Volume", COLORS["accent"]),
                use_container_width=True, key="wk_fc",
            )

        # Day comparison
        available_days = [d for d in DAY_ORDER if d in arrival_table.columns]
        if available_days:
            sel_day = st.selectbox("Compare a specific day", available_days)
            st.plotly_chart(
                comparison_bar_chart(arrival_table, forecast_table, sel_day),
                use_container_width=True, key="cmp_day",
            )

        # HC line chart
        st.markdown("**HC Required by Hour (all days overlay)**")
        fig_hc = go.Figure()
        day_colors = ["#3B82F6", "#8B5CF6", "#10B981", "#F59E0B", "#EF4444", "#EC4899", "#6366F1"]
        for i, day in enumerate(available_days):
            fig_hc.add_trace(go.Scatter(
                x=hc_table.index, y=hc_table[day],
                mode="lines+markers", name=day,
                line=dict(color=day_colors[i % len(day_colors)], width=2),
                marker=dict(size=5),
            ))
        fig_hc.update_layout(
            title=dict(text="HC Required per Hour (by day)", font=dict(size=14, color=COLORS["text_primary"])),
            height=420, **PLOTLY_LAYOUT,
        )
        st.plotly_chart(fig_hc, use_container_width=True, key="hc_lines")

        # Download all tables as Excel
        buf = io.BytesIO()
        with pd.ExcelWriter(buf, engine="openpyxl") as writer:
            arrival_table.to_excel(writer, sheet_name="Arrival Pattern")
            forecast_table.to_excel(writer, sheet_name="Forecasted Volume")
            hc_table.to_excel(writer, sheet_name="HC Required")
        st.download_button(
            "⬇️ Download All Tables (Excel)",
            buf.getvalue(),
            "wfm_analysis.xlsx",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            key="dl_all",
        )


if __name__ == "__main__":
    main()
