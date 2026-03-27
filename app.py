"""
Volume Arrival & Forecasting Dashboard
========================================
A Streamlit-based WFM analytics dashboard for processing multi-team arrival data,
categorizing by channel (Case vs. Chat), and providing high-accuracy forecasting.

Author: WFM Analytics Engine
"""

import streamlit as st
import pandas as pd
import numpy as np
import plotly.graph_objects as go
import plotly.express as px
from plotly.subplots import make_subplots
from datetime import datetime, timedelta
from statsmodels.tsa.holtwinters import ExponentialSmoothing
import warnings
import io

warnings.filterwarnings("ignore")

# ─────────────────────────────────────────────────────────────
# PAGE CONFIG & CUSTOM CSS
# ─────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="WFM Volume Arrival & Forecasting",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="expanded",
)

CUSTOM_CSS = """
<style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

    html, body, [class*="css"] {
        font-family: 'Inter', sans-serif;
    }

    /* Main header */
    .main-header {
        background: linear-gradient(135deg, #0F172A 0%, #1E3A5F 50%, #334155 100%);
        padding: 1.8rem 2rem;
        border-radius: 12px;
        margin-bottom: 1.5rem;
        border: 1px solid rgba(59, 130, 246, 0.2);
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
    }
    .main-header h1 {
        color: #F1F5F9;
        font-size: 1.8rem;
        font-weight: 700;
        margin: 0;
        letter-spacing: -0.02em;
    }
    .main-header p {
        color: #94A3B8;
        font-size: 0.95rem;
        margin: 0.3rem 0 0 0;
    }

    /* Metric cards */
    .metric-card {
        background: linear-gradient(145deg, #1E293B, #0F172A);
        border: 1px solid rgba(59, 130, 246, 0.15);
        border-radius: 10px;
        padding: 1.2rem 1.4rem;
        text-align: center;
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
        transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    .metric-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(59, 130, 246, 0.15);
    }
    .metric-card .metric-value {
        font-size: 2rem;
        font-weight: 700;
        color: #3B82F6;
        line-height: 1.2;
    }
    .metric-card .metric-label {
        font-size: 0.8rem;
        color: #94A3B8;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        margin-top: 0.3rem;
    }

    /* Section headers */
    .section-header {
        color: #E2E8F0;
        font-size: 1.15rem;
        font-weight: 600;
        border-left: 3px solid #3B82F6;
        padding-left: 0.8rem;
        margin: 1.5rem 0 0.8rem 0;
    }

    /* Forecast badge */
    .forecast-badge {
        display: inline-block;
        background: linear-gradient(135deg, #3B82F6, #2563EB);
        color: white;
        padding: 0.3rem 0.9rem;
        border-radius: 20px;
        font-size: 0.75rem;
        font-weight: 600;
        letter-spacing: 0.04em;
        margin-bottom: 0.5rem;
    }

    /* Tabs styling */
    .stTabs [data-baseweb="tab-list"] {
        gap: 0.5rem;
        background: #1E293B;
        padding: 0.5rem;
        border-radius: 10px;
    }
    .stTabs [data-baseweb="tab"] {
        border-radius: 8px;
        color: #94A3B8;
        font-weight: 500;
        font-size: 0.85rem;
        padding: 0.5rem 1rem;
    }
    .stTabs [aria-selected="true"] {
        background: #3B82F6 !important;
        color: white !important;
    }

    /* Dataframe styling */
    .stDataFrame {
        border-radius: 8px;
        overflow: hidden;
    }

    /* Sidebar styling */
    [data-testid="stSidebar"] {
        background: linear-gradient(180deg, #0F172A 0%, #1E293B 100%);
    }
    [data-testid="stSidebar"] .stMarkdown h1,
    [data-testid="stSidebar"] .stMarkdown h2,
    [data-testid="stSidebar"] .stMarkdown h3 {
        color: #F1F5F9;
    }

    /* Peak hour highlight */
    .peak-hour {
        background: rgba(245, 158, 11, 0.15);
        border-left: 3px solid #F59E0B;
        padding: 0.5rem 1rem;
        border-radius: 0 6px 6px 0;
        margin: 0.3rem 0;
        font-size: 0.85rem;
        color: #FCD34D;
    }

    /* Info box */
    .info-box {
        background: rgba(59, 130, 246, 0.08);
        border: 1px solid rgba(59, 130, 246, 0.2);
        border-radius: 8px;
        padding: 1rem 1.2rem;
        margin: 0.8rem 0;
        font-size: 0.88rem;
        color: #CBD5E1;
    }

    /* Hide default streamlit elements */
    #MainMenu {visibility: hidden;}
    footer {visibility: hidden;}
    header {visibility: hidden;}

    /* Expander styling */
    .streamlit-expanderHeader {
        font-weight: 600;
        color: #E2E8F0;
    }
</style>
"""

st.markdown(CUSTOM_CSS, unsafe_allow_html=True)

# ─────────────────────────────────────────────────────────────
# COLOR PALETTE
# ─────────────────────────────────────────────────────────────
COLORS = {
    "primary": "#3B82F6",
    "primary_light": "#60A5FA",
    "secondary": "#8B5CF6",
    "accent": "#F59E0B",
    "success": "#10B981",
    "danger": "#EF4444",
    "bg_dark": "#0F172A",
    "bg_card": "#1E293B",
    "bg_surface": "#334155",
    "text_primary": "#F1F5F9",
    "text_secondary": "#94A3B8",
    "text_muted": "#64748B",
    "case_color": "#3B82F6",
    "chat_color": "#8B5CF6",
    "forecast_color": "#F59E0B",
    "grid_color": "rgba(148, 163, 184, 0.08)",
}

PLOTLY_LAYOUT = dict(
    paper_bgcolor="rgba(0,0,0,0)",
    plot_bgcolor="rgba(0,0,0,0)",
    font=dict(family="Inter, sans-serif", color=COLORS["text_secondary"], size=12),
    xaxis=dict(
        gridcolor=COLORS["grid_color"],
        zerolinecolor=COLORS["grid_color"],
        tickfont=dict(size=10),
    ),
    yaxis=dict(
        gridcolor=COLORS["grid_color"],
        zerolinecolor=COLORS["grid_color"],
        tickfont=dict(size=10),
    ),
    margin=dict(l=50, r=30, t=50, b=50),
    legend=dict(
        bgcolor="rgba(30, 41, 59, 0.8)",
        bordercolor="rgba(59, 130, 246, 0.2)",
        borderwidth=1,
        font=dict(color=COLORS["text_secondary"], size=11),
    ),
    hoverlabel=dict(
        bgcolor=COLORS["bg_card"],
        bordercolor=COLORS["primary"],
        font=dict(color=COLORS["text_primary"], size=12),
    ),
)


# ─────────────────────────────────────────────────────────────
# SYNTHETIC DATA GENERATOR
# ─────────────────────────────────────────────────────────────
def generate_synthetic_data(
    num_days: int = 30,
    teams: list = None,
    seed: int = 42,
) -> pd.DataFrame:
    """
    Generate realistic WFM arrival data with intra-day seasonality,
    day-of-week patterns, and realistic volume distributions.
    """
    if teams is None:
        teams = ["Support", "Sales", "Tech"]

    np.random.seed(seed)

    record_types = {
        "Support": ["Incident", "Service Request", "Escalation"],
        "Sales": ["New Lead", "Renewal", "Upsell"],
        "Tech": ["Bug Report", "Feature Request", "Maintenance"],
    }
    specializations = {
        "Support": ["Billing", "Account", "Product"],
        "Sales": ["Enterprise", "SMB", "Consumer"],
        "Tech": ["Backend", "Frontend", "Infrastructure"],
    }
    origins = ["Case", "Chat"]

    records = []
    start_date = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=num_days)

    for day_offset in range(num_days):
        current_date = start_date + timedelta(days=day_offset)
        day_of_week = current_date.weekday()

        # Day-of-week multiplier (Mon=busy, Sun=quiet)
        dow_multiplier = {
            0: 1.3, 1: 1.2, 2: 1.15, 3: 1.1, 4: 1.0,
            5: 0.5, 6: 0.3,
        }.get(day_of_week, 1.0)

        for hour in range(24):
            # Intra-day seasonality: peaks at 10am and 2pm
            hour_multiplier = (
                0.1 + 0.9 * np.exp(-0.5 * ((hour - 10) / 2.5) ** 2)
                + 0.7 * np.exp(-0.5 * ((hour - 14) / 2.5) ** 2)
            )

            for team in teams:
                base_volume = {"Support": 25, "Sales": 15, "Tech": 10}.get(team, 15)

                for origin in origins:
                    origin_weight = 0.65 if origin == "Case" else 0.35
                    expected = base_volume * dow_multiplier * hour_multiplier * origin_weight

                    # Poisson-distributed arrivals
                    count = max(0, np.random.poisson(max(0.1, expected)))

                    for _ in range(count):
                        minute = np.random.randint(0, 60)
                        second = np.random.randint(0, 60)
                        ts = current_date + timedelta(hours=hour, minutes=minute, seconds=second)

                        team_recs = record_types.get(team, ["General"])
                        team_specs = specializations.get(team, ["General"])

                        records.append({
                            "Timestamp": ts,
                            "Team": team,
                            "Origin": origin,
                            "Record Type": np.random.choice(team_recs),
                            "Specialization": np.random.choice(team_specs),
                        })

    df = pd.DataFrame(records)
    if len(df) > 0:
        df = df.sort_values("Timestamp").reset_index(drop=True)
    return df


# ─────────────────────────────────────────────────────────────
# DATA PROCESSING
# ─────────────────────────────────────────────────────────────
def validate_columns(df: pd.DataFrame) -> tuple:
    """Validate that the DataFrame has all required columns."""
    required = {"Timestamp", "Team", "Origin", "Record Type", "Specialization"}
    missing = required - set(df.columns)
    if missing:
        return False, f"Missing columns: {', '.join(missing)}"
    return True, "All columns present."


def parse_and_clean(df: pd.DataFrame) -> pd.DataFrame:
    """Parse timestamps and clean data."""
    df = df.copy()

    # Parse Timestamp
    for fmt in [None, "%Y-%m-%d %H:%M:%S", "%m/%d/%Y %H:%M", "%d-%m-%Y %H:%M:%S"]:
        try:
            df["Timestamp"] = pd.to_datetime(df["Timestamp"], format=fmt)
            break
        except (ValueError, TypeError):
            continue

    df["Timestamp"] = pd.to_datetime(df["Timestamp"], errors="coerce")
    initial_count = len(df)
    df = df.dropna(subset=["Timestamp"])
    dropped = initial_count - len(df)

    # Normalize Origin column
    df["Origin"] = df["Origin"].astype(str).str.strip().str.title()
    df.loc[~df["Origin"].isin(["Case", "Chat"]), "Origin"] = "Case"

    # Clean string columns
    for col in ["Team", "Record Type", "Specialization"]:
        df[col] = df[col].astype(str).str.strip()

    if dropped > 0:
        st.warning(f"⚠️ Dropped {dropped} rows with unparseable timestamps.")

    return df


def resample_hourly(df: pd.DataFrame, origin: str, group_cols: list = None) -> pd.DataFrame:
    """
    Resample data to 1-hour intervals, filling missing intervals with zeros.
    Creates a continuous timeline.
    """
    filtered = df[df["Origin"] == origin].copy()

    if filtered.empty:
        return pd.DataFrame(columns=["Timestamp", "Volume"])

    filtered["Hour"] = filtered["Timestamp"].dt.floor("h")

    if group_cols:
        volume = filtered.groupby(["Hour"] + group_cols).size().reset_index(name="Volume")
    else:
        volume = filtered.groupby("Hour").size().reset_index(name="Volume")

    # Create continuous hourly range
    full_range = pd.date_range(
        start=df["Timestamp"].min().floor("h"),
        end=df["Timestamp"].max().floor("h"),
        freq="h",
    )
    full_df = pd.DataFrame({"Hour": full_range})

    if group_cols:
        # For grouped data, ensure all hours exist for each group
        from itertools import product

        unique_combos = filtered[group_cols].drop_duplicates()
        combo_dicts = unique_combos.to_dict("records")
        rows = []
        for combo in combo_dicts:
            for h in full_range:
                row = {"Hour": h}
                row.update(combo)
                rows.append(row)
        full_df = pd.DataFrame(rows)
        volume = full_df.merge(volume, on=["Hour"] + group_cols, how="left").fillna({"Volume": 0})
    else:
        volume = full_df.merge(volume, on="Hour", how="left").fillna({"Volume": 0})

    volume["Volume"] = volume["Volume"].astype(int)
    volume = volume.rename(columns={"Hour": "Timestamp"})
    return volume.sort_values("Timestamp").reset_index(drop=True)


# ─────────────────────────────────────────────────────────────
# FORECASTING ENGINE
# ─────────────────────────────────────────────────────────────
def forecast_volume(
    hourly_data: pd.DataFrame,
    forecast_hours: int = 168,
    min_data_points: int = 48,
) -> pd.DataFrame:
    """
    Forecast hourly volume using Triple Exponential Smoothing (Holt-Winters).
    Models: y_t = Trend + Seasonality_daily + Seasonality_weekly + ε

    Falls back to simpler models if data is insufficient for full seasonal decomposition.
    """
    if hourly_data.empty or len(hourly_data) < min_data_points:
        return pd.DataFrame(columns=["Timestamp", "Forecast", "Lower", "Upper"])

    ts = hourly_data.set_index("Timestamp")["Volume"].copy()
    ts = ts.asfreq("h", fill_value=0)

    # Ensure non-negative and add small constant for multiplicative models
    ts = ts.clip(lower=0)

    last_timestamp = ts.index[-1]
    future_index = pd.date_range(
        start=last_timestamp + timedelta(hours=1),
        periods=forecast_hours,
        freq="h",
    )

    try:
        data_length = len(ts)

        if data_length >= 168:
            # Full weekly seasonality (168 hours = 7 days)
            seasonal_periods = 168
        elif data_length >= 24:
            # Daily seasonality
            seasonal_periods = 24
        else:
            # Simple exponential smoothing (no seasonality)
            seasonal_periods = None

        if seasonal_periods and data_length >= 2 * seasonal_periods:
            model = ExponentialSmoothing(
                ts.values.astype(float),
                trend="add",
                seasonal="add",
                seasonal_periods=seasonal_periods,
                initialization_method="estimated",
            )
            fit = model.fit(optimized=True, use_brute=True)
            forecast = fit.forecast(forecast_hours)

            # Prediction intervals (approximate via residual std)
            residuals = ts.values - fit.fittedvalues
            residual_std = np.std(residuals)
            lower = forecast - 1.96 * residual_std
            upper = forecast + 1.96 * residual_std
        elif seasonal_periods:
            model = ExponentialSmoothing(
                ts.values.astype(float),
                trend="add",
                seasonal=None,
                initialization_method="estimated",
            )
            fit = model.fit(optimized=True)
            forecast = fit.forecast(forecast_hours)

            residuals = ts.values - fit.fittedvalues
            residual_std = np.std(residuals)
            lower = forecast - 1.96 * residual_std
            upper = forecast + 1.96 * residual_std
        else:
            model = ExponentialSmoothing(
                ts.values.astype(float),
                trend=None,
                seasonal=None,
                initialization_method="estimated",
            )
            fit = model.fit(optimized=True)
            forecast = fit.forecast(forecast_hours)

            residuals = ts.values - fit.fittedvalues
            residual_std = np.std(residuals)
            lower = forecast - 1.96 * residual_std
            upper = forecast + 1.96 * residual_std

    except Exception as e:
        # Ultimate fallback: use last 7 days' hourly averages
        st.info(f"ℹ️ Using moving-average fallback for forecast: {e}")
        if data_length >= 168:
            pattern = ts.values[-168:]
        elif data_length >= 24:
            pattern = ts.values[-24:]
        else:
            pattern = ts.values

        repeats = (forecast_hours // len(pattern)) + 1
        forecast = np.tile(pattern, repeats)[:forecast_hours].astype(float)
        residual_std = np.std(ts.values)
        lower = forecast - 1.96 * residual_std
        upper = forecast + 1.96 * residual_std

    # Ensure non-negative
    forecast = np.maximum(forecast, 0)
    lower = np.maximum(lower, 0)

    result = pd.DataFrame({
        "Timestamp": future_index,
        "Forecast": np.round(forecast).astype(int),
        "Lower": np.round(lower).astype(int),
        "Upper": np.round(upper.astype(float)).astype(int),
    })
    return result


# ─────────────────────────────────────────────────────────────
# VISUALIZATION
# ─────────────────────────────────────────────────────────────
def create_volume_chart(
    hourly_data: pd.DataFrame,
    forecast_data: pd.DataFrame,
    title: str,
    color: str,
    show_forecast: bool = True,
) -> go.Figure:
    """Create an interactive Plotly chart with historical data and forecast."""
    fig = go.Figure()

    # Historical data
    if not hourly_data.empty:
        fig.add_trace(go.Scatter(
            x=hourly_data["Timestamp"],
            y=hourly_data["Volume"],
            mode="lines",
            name="Actual Volume",
            line=dict(color=color, width=2),
            fill="tozeroy",
            fillcolor=f"rgba({int(color[1:3], 16)}, {int(color[3:5], 16)}, {int(color[5:7], 16)}, 0.08)",
            hovertemplate="<b>%{x}</b><br>Volume: %{y:,.0f}<extra></extra>",
        ))

    # Forecast
    if show_forecast and not forecast_data.empty:
        fig.add_trace(go.Scatter(
            x=forecast_data["Timestamp"],
            y=forecast_data["Forecast"],
            mode="lines",
            name="Forecast",
            line=dict(color=COLORS["forecast_color"], width=2, dash="dash"),
            hovertemplate="<b>%{x}</b><br>Forecast: %{y:,.0f}<extra></extra>",
        ))

        # Confidence interval
        fig.add_trace(go.Scatter(
            x=pd.concat([forecast_data["Timestamp"], forecast_data["Timestamp"][::-1]]),
            y=pd.concat([forecast_data["Upper"], forecast_data["Lower"][::-1]]),
            fill="toself",
            fillcolor="rgba(245, 158, 11, 0.08)",
            line=dict(color="rgba(245, 158, 11, 0)"),
            name="95% Confidence",
            hoverinfo="skip",
        ))

    fig.update_layout(
        title=dict(text=title, font=dict(size=15, color=COLORS["text_primary"])),
        height=380,
        **PLOTLY_LAYOUT,
    )
    fig.update_xaxes(title_text="Time", rangeslider=dict(visible=True, thickness=0.04))
    fig.update_yaxes(title_text="Volume")

    return fig


def create_heatmap(hourly_data: pd.DataFrame, title: str, color_scale: str = "Blues") -> go.Figure:
    """Create hour-of-day vs day-of-week heatmap."""
    if hourly_data.empty:
        return go.Figure()

    df = hourly_data.copy()
    df["DayOfWeek"] = df["Timestamp"].dt.day_name()
    df["Hour"] = df["Timestamp"].dt.hour

    pivot = df.pivot_table(values="Volume", index="DayOfWeek", columns="Hour", aggfunc="mean")

    day_order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    pivot = pivot.reindex([d for d in day_order if d in pivot.index])

    fig = go.Figure(data=go.Heatmap(
        z=pivot.values,
        x=[f"{h:02d}:00" for h in pivot.columns],
        y=pivot.index,
        colorscale=color_scale,
        hovertemplate="<b>%{y} %{x}</b><br>Avg Volume: %{z:.1f}<extra></extra>",
    ))

    fig.update_layout(
        title=dict(text=title, font=dict(size=14, color=COLORS["text_primary"])),
        height=300,
        **PLOTLY_LAYOUT,
    )
    return fig


def style_dataframe(df: pd.DataFrame, peak_col: str = "Volume"):
    """Apply conditional formatting to highlight peak volume hours."""
    if df.empty:
        return df.style

    def highlight_peaks(s):
        if s.name != peak_col:
            return [""] * len(s)
        threshold = s.quantile(0.9)
        return [
            "background-color: rgba(245, 158, 11, 0.25); color: #FCD34D; font-weight: 600"
            if v >= threshold else ""
            for v in s
        ]

    styled = df.style.apply(highlight_peaks).format(
        {peak_col: "{:,.0f}"} if peak_col in df.columns else {}
    )
    return styled


# ─────────────────────────────────────────────────────────────
# RENDER HELPERS
# ─────────────────────────────────────────────────────────────
def render_metrics(data: pd.DataFrame, origin: str, prefix: str = ""):
    """Render KPI metric cards."""
    filtered = data[data["Origin"] == origin] if "Origin" in data.columns else data
    hourly = resample_hourly(data if "Origin" in data.columns else data, origin)

    total_volume = len(filtered) if "Origin" in data.columns else hourly["Volume"].sum()
    peak_volume = hourly["Volume"].max() if not hourly.empty else 0
    avg_volume = hourly["Volume"].mean() if not hourly.empty else 0

    if not hourly.empty and peak_volume > 0:
        peak_hour_row = hourly.loc[hourly["Volume"].idxmax()]
        peak_time = peak_hour_row["Timestamp"].strftime("%a %I %p")
    else:
        peak_time = "N/A"

    cols = st.columns(4)
    metrics_data = [
        (f"{total_volume:,}", "Total Volume"),
        (f"{peak_volume:,}", "Peak Hourly Vol."),
        (f"{avg_volume:,.1f}", "Avg Hourly Vol."),
        (peak_time, "Peak Time"),
    ]

    for col, (value, label) in zip(cols, metrics_data):
        col.markdown(
            f"""<div class="metric-card">
                <div class="metric-value">{value}</div>
                <div class="metric-label">{prefix}{label}</div>
            </div>""",
            unsafe_allow_html=True,
        )


def render_volume_section(
    data: pd.DataFrame,
    origin: str,
    color: str,
    key_prefix: str,
    show_forecast: bool = True,
):
    """Render a complete volume section: metrics, chart, table, and forecast."""
    emoji = "📋" if origin == "Case" else "💬"
    st.markdown(
        f'<div class="section-header">{emoji} {origin} Volume Analysis</div>',
        unsafe_allow_html=True,
    )

    render_metrics(data, origin, f"{origin} ")

    hourly = resample_hourly(data, origin)

    if hourly.empty:
        st.info(f"No {origin} data available for the selected filters.")
        return

    # Forecast
    forecast_df = pd.DataFrame()
    if show_forecast:
        with st.spinner(f"🔮 Generating {origin} forecast..."):
            forecast_df = forecast_volume(hourly)

    # Chart
    fig = create_volume_chart(
        hourly,
        forecast_df,
        f"Hourly {origin} Volume — Actuals vs. 7-Day Forecast",
        color,
        show_forecast=show_forecast and not forecast_df.empty,
    )
    st.plotly_chart(fig, use_container_width=True, key=f"{key_prefix}_{origin}_chart")

    # Heatmap
    heatmap_scale = "Blues" if origin == "Case" else "Purples"
    heatmap = create_heatmap(hourly, f"Average {origin} Volume — Hour × Day Heatmap", heatmap_scale)
    st.plotly_chart(heatmap, use_container_width=True, key=f"{key_prefix}_{origin}_heatmap")

    # Tables
    col1, col2 = st.columns(2)

    with col1:
        st.markdown(f"**📊 Hourly {origin} Volume (Last 48h)**")
        recent = hourly.tail(48).copy()
        recent["Timestamp"] = recent["Timestamp"].dt.strftime("%Y-%m-%d %H:%M")
        st.dataframe(
            style_dataframe(recent),
            use_container_width=True,
            height=350,
            key=f"{key_prefix}_{origin}_table",
        )

    with col2:
        if not forecast_df.empty:
            st.markdown(
                '<span class="forecast-badge">🔮 7-DAY FORECAST</span>',
                unsafe_allow_html=True,
            )
            st.markdown(f"**Forecasted {origin} Volume (Next 168h)**")
            display_forecast = forecast_df.copy()
            display_forecast["Timestamp"] = display_forecast["Timestamp"].dt.strftime("%Y-%m-%d %H:%M")
            st.dataframe(
                style_dataframe(display_forecast, "Forecast"),
                use_container_width=True,
                height=350,
                key=f"{key_prefix}_{origin}_forecast_table",
            )

            # Forecast summary
            st.markdown(
                f"""<div class="info-box">
                    <strong>Forecast Summary:</strong><br>
                    📈 Total Predicted: <strong>{forecast_df['Forecast'].sum():,}</strong> |
                    🔺 Peak Forecast: <strong>{forecast_df['Forecast'].max():,}</strong> |
                    📊 Avg/Hour: <strong>{forecast_df['Forecast'].mean():.1f}</strong>
                </div>""",
                unsafe_allow_html=True,
            )
        else:
            st.info("Insufficient data to generate forecast (need at least 48 data points).")


def render_tab_content(data: pd.DataFrame, tab_name: str, key_prefix: str):
    """Render the full content of a tab (Master or Team)."""
    show_forecast = st.checkbox(
        "🔮 Enable 7-Day Forecast",
        value=True,
        key=f"{key_prefix}_forecast_toggle",
        help="Generate a 168-hour forecast using Exponential Smoothing",
    )

    render_volume_section(data, "Case", COLORS["case_color"], key_prefix, show_forecast)
    st.divider()
    render_volume_section(data, "Chat", COLORS["chat_color"], key_prefix, show_forecast)


# ─────────────────────────────────────────────────────────────
# SIDEBAR
# ─────────────────────────────────────────────────────────────
def render_sidebar():
    """Render the sidebar with data upload and global filters."""
    with st.sidebar:
        st.markdown("## 📊 WFM Dashboard")
        st.markdown("---")

        # Data Source Selection
        st.markdown("### 📁 Data Source")
        data_source = st.radio(
            "Choose data source:",
            ["📎 Upload File", "🧪 Generate Sample Data"],
            key="data_source",
            label_visibility="collapsed",
        )

        if data_source == "📎 Upload File":
            uploaded_file = st.file_uploader(
                "Upload CSV or Excel",
                type=["csv", "xlsx", "xls"],
                key="file_uploader",
                help="File must contain: Timestamp, Team, Origin, Record Type, Specialization",
            )

            if uploaded_file is not None:
                try:
                    if uploaded_file.name.endswith(".csv"):
                        df = pd.read_csv(uploaded_file)
                    else:
                        df = pd.read_excel(uploaded_file)

                    valid, message = validate_columns(df)
                    if not valid:
                        st.error(f"❌ {message}")
                        return None
                    else:
                        st.success("✅ File loaded successfully!")
                        df = parse_and_clean(df)
                        st.session_state["raw_data"] = df

                except Exception as e:
                    st.error(f"❌ Error reading file: {e}")
                    return None

        else:
            st.markdown("#### Sample Data Settings")
            num_days = st.slider("History (days)", 7, 90, 30, key="syn_days")
            teams_input = st.text_input(
                "Teams (comma-separated)",
                "Support, Sales, Tech",
                key="syn_teams",
            )
            teams = [t.strip() for t in teams_input.split(",") if t.strip()]

            if st.button("🚀 Generate Data", key="generate_btn", use_container_width=True):
                with st.spinner("Generating synthetic dataset..."):
                    df = generate_synthetic_data(num_days=num_days, teams=teams)
                    st.session_state["raw_data"] = df
                    st.success(f"✅ Generated {len(df):,} records across {num_days} days!")

        st.markdown("---")

        # Global Filters
        if "raw_data" in st.session_state and st.session_state["raw_data"] is not None:
            df = st.session_state["raw_data"]

            st.markdown("### 🎯 Global Filters")
            all_teams = sorted(df["Team"].unique().tolist())
            selected_teams = st.multiselect(
                "Filter by Team",
                options=all_teams,
                default=all_teams,
                key="global_team_filter",
            )

            if selected_teams:
                st.session_state["filtered_data"] = df[df["Team"].isin(selected_teams)].copy()
            else:
                st.session_state["filtered_data"] = df.copy()

            filtered = st.session_state["filtered_data"]

            # Dataset info
            st.markdown("### ℹ️ Dataset Info")
            st.markdown(
                f"""<div class="info-box">
                📦 <strong>{len(filtered):,}</strong> records<br>
                📅 {filtered['Timestamp'].min().strftime('%Y-%m-%d')} → {filtered['Timestamp'].max().strftime('%Y-%m-%d')}<br>
                👥 {filtered['Team'].nunique()} Teams<br>
                📋 Cases: <strong>{len(filtered[filtered['Origin']=='Case']):,}</strong><br>
                💬 Chats: <strong>{len(filtered[filtered['Origin']=='Chat']):,}</strong>
                </div>""",
                unsafe_allow_html=True,
            )

            # Download option
            st.markdown("---")
            csv = filtered.to_csv(index=False)
            st.download_button(
                "⬇️ Download Filtered Data",
                csv,
                "wfm_filtered_data.csv",
                "text/csv",
                key="download_btn",
                use_container_width=True,
            )

            return st.session_state["filtered_data"]

    return None


# ─────────────────────────────────────────────────────────────
# MAIN APP
# ─────────────────────────────────────────────────────────────
def main():
    """Main application entry point."""

    # Initialize session state
    if "raw_data" not in st.session_state:
        st.session_state["raw_data"] = None
    if "filtered_data" not in st.session_state:
        st.session_state["filtered_data"] = None

    # Render sidebar and get filtered data
    filtered_data = render_sidebar()

    # Header
    st.markdown(
        """<div class="main-header">
            <h1>📊 Volume Arrival & Forecasting Dashboard</h1>
            <p>Workforce Management Analytics — Multi-Team Channel Analysis & Predictive Modeling</p>
        </div>""",
        unsafe_allow_html=True,
    )

    # No data state
    if filtered_data is None or filtered_data.empty:
        st.markdown(
            """<div style="text-align: center; padding: 4rem 2rem;">
                <div style="font-size: 4rem; margin-bottom: 1rem;">📊</div>
                <h2 style="color: #E2E8F0; font-weight: 600;">Welcome to the WFM Dashboard</h2>
                <p style="color: #94A3B8; font-size: 1.1rem; max-width: 500px; margin: 0 auto;">
                    Upload a CSV/Excel file or generate sample data using the sidebar to get started.
                </p>
                <div style="margin-top: 2rem; padding: 1.5rem; background: rgba(59, 130, 246, 0.08);
                     border-radius: 10px; max-width: 450px; margin-left: auto; margin-right: auto;
                     border: 1px solid rgba(59, 130, 246, 0.15);">
                    <p style="color: #94A3B8; font-size: 0.88rem; text-align: left; margin: 0;">
                        <strong style="color: #E2E8F0;">Required columns:</strong><br>
                        📅 Timestamp &nbsp; 👥 Team &nbsp; 📋 Origin<br>
                        🏷️ Record Type &nbsp; 🔧 Specialization
                    </p>
                </div>
            </div>""",
            unsafe_allow_html=True,
        )
        return

    # Build tabs
    teams = sorted(filtered_data["Team"].unique().tolist())
    tab_names = ["🏠 Master View"] + [f"👥 {team}" for team in teams]
    tabs = st.tabs(tab_names)

    # ── Master Tab ──
    with tabs[0]:
        render_tab_content(filtered_data, "Master", "master")

    # ── Team Tabs ──
    for idx, team in enumerate(teams):
        with tabs[idx + 1]:
            team_data = filtered_data[filtered_data["Team"] == team].copy()

            # Team-specific filters
            filter_col1, filter_col2 = st.columns(2)

            with filter_col1:
                record_types = sorted(team_data["Record Type"].unique().tolist())
                selected_rt = st.multiselect(
                    "Filter by Record Type",
                    options=record_types,
                    default=record_types,
                    key=f"team_{team}_rt_filter",
                )

            with filter_col2:
                # Cascading filter: specializations based on selected record types
                if selected_rt:
                    available_specs = sorted(
                        team_data[team_data["Record Type"].isin(selected_rt)]["Specialization"]
                        .unique()
                        .tolist()
                    )
                else:
                    available_specs = sorted(team_data["Specialization"].unique().tolist())

                selected_spec = st.multiselect(
                    "Filter by Specialization",
                    options=available_specs,
                    default=available_specs,
                    key=f"team_{team}_spec_filter",
                )

            # Apply team-specific filters
            if selected_rt:
                team_data = team_data[team_data["Record Type"].isin(selected_rt)]
            if selected_spec:
                team_data = team_data[team_data["Specialization"].isin(selected_spec)]

            if team_data.empty:
                st.warning("No data matches the selected filters.")
            else:
                st.markdown(
                    f"""<div class="info-box">
                        <strong>{team}</strong> — {len(team_data):,} records |
                        Record Types: {len(selected_rt)} |
                        Specializations: {len(selected_spec)}
                    </div>""",
                    unsafe_allow_html=True,
                )
                render_tab_content(team_data, team, f"team_{team}")


if __name__ == "__main__":
    main()
