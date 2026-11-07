from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Iterable

import pandas as pd
import streamlit as st


st.set_page_config(
    page_title="Cada hora cuenta | Planificación asistencial",
    page_icon="⏱️",
    layout="wide",
    initial_sidebar_state="expanded",
)

BASE_DIR = Path(__file__).parent
DEFAULT_DOTACION = BASE_DIR / "Nac-Base-contratos-x-mes.csv"

MONTHS = {
    "Jan-26": "Enero",
    "Feb-26": "Febrero",
    "Mar-26": "Marzo",
    "Apr-26": "Abril",
    "May-26": "Mayo",
    "Jun-26": "Junio",
    "Jul-26": "Julio",
    "Aug-26": "Agosto",
    "Sep-26": "Septiembre",
    "Oct-26": "Octubre",
    "Nov-26": "Noviembre",
    "Dec-26": "Diciembre",
}
MONTH_ORDER = list(MONTHS)

RAW_COLUMNS = [
    "it_code",
    "institute_code",
    "person_id",
    "area",
    "subarea",
    "cost_center",
    "birth_date",
    "period",
    "contract_type",
    "worker_type",
    "start_date",
    "end_date",
    "weekly_hours",
    "role",
    "worker_category",
    "work_days",
    "sic_regime",
    "specialty_code",
    "work_days_per_week",
]

INSTITUTE_NAMES = {
    "Ari": "Arica",
    "Iqu": "Iquique",
    "Ant": "Antofagasta",
    "Cal": "Calama",
    "Cop": "Copiapó",
    "Coq": "Coquimbo",
    "Val": "Valparaíso",
    "OHi": "O'Higgins",
    "Tal": "Talca",
    "Con": "Concepción",
    "Tem": "Temuco",
    "PMo": "Puerto Montt",
    "Coy": "Coyhaique",
    "Vdv": "Valdivia",
    "Cas": "Castro",
    "San": "Santiago",
}

GROUP_SPECIALTIES = {"ED", "AS", "UTA", "ULAB", "UTAC"}
GROUP_RULES = {
    "ED": (0.55, 3.0),
    "AS": (0.35, 3.0),
    "UTA": (0.55, 3.0),
    "ULAB": (0.55, 3.0),
    "UTAC": (0.55, 3.0),
}


def _clean_text(value: object) -> str:
    if pd.isna(value):
        return ""
    return str(value).strip()


@st.cache_data(show_spinner=False)
def load_dotacion(source: str | bytes) -> pd.DataFrame:
    """Load the report even when the export includes a blank first row."""
    if isinstance(source, bytes):
        from io import BytesIO

        payload = BytesIO(source)
    else:
        payload = source

    raw = pd.read_csv(payload, header=None, dtype=str, encoding="utf-8-sig")
    raw = raw.dropna(how="all").reset_index(drop=True)
    if len(raw) < 2:
        raise ValueError("El archivo de dotación no contiene filas de datos.")

    data = raw.iloc[1:].copy()
    data = data.iloc[:, : len(RAW_COLUMNS)]
    data.columns = RAW_COLUMNS
    data = data[data["person_id"].fillna("").str.lower() != "personaid"]

    for column in RAW_COLUMNS:
        data[column] = data[column].map(_clean_text)

    data["weekly_hours"] = pd.to_numeric(data["weekly_hours"], errors="coerce")
    data["work_days_per_week"] = pd.to_numeric(
        data["work_days_per_week"], errors="coerce"
    )
    data["period_date"] = pd.to_datetime(
        data["period"], format="%b-%y", errors="coerce"
    )
    data["month"] = data["period"].map(MONTHS).fillna(data["period"])
    data["institute"] = data["institute_code"].map(INSTITUTE_NAMES).fillna(
        data["institute_code"]
    )
    data["area"] = data["area"].replace({"": "Sin área informada"})
    data["role"] = data["role"].replace({"": "Cargo no informado"})
    data["specialty_code"] = data["specialty_code"].replace(
        {"": "Sin especialidad"}
    )
    return data.reset_index(drop=True)


def validation_report(data: pd.DataFrame) -> pd.DataFrame:
    checks = [
        (
            "Filas sin identificador",
            int(data["person_id"].eq("").sum()),
            "Cada fila mensual debe tener PersonaId.",
        ),
        (
            "Filas sin período",
            int(data["period_date"].isna().sum()),
            "El período debe estar en formato Mes-26.",
        ),
        (
            "Horas inválidas",
            int(data["weekly_hours"].isna().sum() + (data["weekly_hours"] < 0).sum()),
            "Las horas semanales deben ser numéricas y no negativas.",
        ),
        (
            "Duplicados profesional-mes",
            int(data.duplicated(["person_id", "period"]).sum()),
            "No debe existir más de una fila por profesional y mes.",
        ),
        (
            "Cargos sin especialidad",
            int(data["specialty_code"].eq("Sin especialidad").sum()),
            "Revisar antes de aprobar la planificación.",
        ),
    ]
    return pd.DataFrame(checks, columns=["Control", "Hallazgos", "Criterio"])


def default_distribution(row: pd.Series) -> tuple[float, float, float]:
    role = row["role"].upper()
    if any(token in role for token in ("DIRECTOR", "JEFE", "COORDINADOR")):
        return 0.45, 0.20, 0.35
    return 0.60, 0.25, 0.15


def calculate_plan(
    data: pd.DataFrame,
    direct_pct: float,
    indirect_pct: float,
    nas_pct: float,
    group_pct: float,
    patients_per_group: float,
    management_target: float,
    standard_minutes: int,
    indirect_minutes: int,
    weeks_per_month: float,
) -> pd.DataFrame:
    result = data.copy()
    distribution = result.apply(default_distribution, axis=1, result_type="expand")
    distribution.columns = ["direct_rule", "indirect_rule", "nas_rule"]
    result = pd.concat([result, distribution], axis=1)

    # Generic parameters are intentionally visible/editable in the dashboard.
    # Role-specific defaults still preserve the management split for leaders.
    result["direct_pct"] = result["direct_rule"].where(
        result["direct_rule"].ne(0.60), direct_pct
    )
    result["indirect_pct"] = result["indirect_rule"].where(
        result["indirect_rule"].ne(0.25), indirect_pct
    )
    result["nas_pct"] = result["nas_rule"].where(
        result["nas_rule"].ne(0.15), nas_pct
    )

    specialty_group = result["specialty_code"].map(
        lambda code: GROUP_RULES.get(code, (group_pct, patients_per_group))
    )
    result["group_pct"] = specialty_group.map(lambda value: value[0])
    result["patients_per_group"] = specialty_group.map(lambda value: value[1])

    result["weeks"] = weeks_per_month
    result["contracted_hours"] = result["weekly_hours"].fillna(0) * result["weeks"]
    result["direct_hours"] = result["contracted_hours"] * result["direct_pct"]
    result["indirect_hours"] = result["contracted_hours"] * result["indirect_pct"]
    result["nas_hours"] = result["contracted_hours"] * result["nas_pct"]
    result["direct_attentions"] = (
        result["direct_hours"]
        * 60
        / standard_minutes
        * (
            1
            + result["group_pct"] * (result["patients_per_group"] - 1)
        )
    ).apply(lambda value: int(max(value, 0)))
    result["indirect_attentions"] = (
        result["indirect_hours"] * 60 / indirect_minutes
    ).apply(lambda value: int(max(value, 0)))
    result["total_attentions"] = (
        result["direct_attentions"] + result["indirect_attentions"]
    )
    result["management_target"] = (
        result["total_attentions"] * management_target
    ).apply(lambda value: int(value))
    result["foja"] = (
        result["direct_hours"] / result["contracted_hours"].replace(0, pd.NA)
    ).fillna(0)
    result["period_order"] = result["period"].map(
        {period: index for index, period in enumerate(MONTH_ORDER)}
    )
    return result


def format_hours(value: float) -> str:
    return f"{value:,.1f} h".replace(",", "X").replace(".", ",").replace("X", ".")


def metric_delta(current: float, previous: float) -> str:
    if previous == 0:
        return "—"
    delta = (current - previous) / previous
    return f"{delta:+.1%}"


def filtered_options(data: pd.DataFrame, column: str) -> list[str]:
    return sorted(value for value in data[column].dropna().unique() if value != "")


def main() -> None:
    st.markdown(
        """
        <style>
        .hero { padding: 1.3rem 1.5rem; border-radius: 16px; background:
          linear-gradient(120deg, #12304a 0%, #167d87 100%); color: white; }
        .hero h1 { margin: 0; font-size: 2rem; }
        .hero p { margin: .35rem 0 0; color: #d7f4f3; }
        .status { border: 1px solid #dfe8ec; border-radius: 12px; padding: .8rem 1rem; }
        .small { color: #657681; font-size: .85rem; }
        </style>
        <div class="hero">
          <h1>⏱️ Cada hora cuenta</h1>
          <p>Planificación asistencial trazable, parametrizable y lista para escalar.</p>
        </div>
        """,
        unsafe_allow_html=True,
    )

    if not DEFAULT_DOTACION.exists():
        st.error("No se encontró el reporte base de dotación en el proyecto.")
        return

    with st.sidebar:
        st.header("Controles de planificación")
        uploaded = st.file_uploader(
            "Reemplazar reporte BUK",
            type=["csv"],
            help="Blue Prism puede depositar aquí el reporte validado para recalcular.",
        )
        st.caption("Si no cargas un archivo, se utiliza el dataset anonimizado incluido.")

        st.subheader("Parámetros editables")
        direct_pct = st.slider("Atención directa", 0.0, 1.0, 0.60, 0.05)
        indirect_pct = st.slider("Atención indirecta", 0.0, 1.0, 0.25, 0.05)
        nas_pct = st.slider("NAS", 0.0, 1.0, 0.15, 0.05)
        group_pct = st.slider("Atención grupal base", 0.0, 1.0, 0.35, 0.05)
        patients_per_group = st.number_input(
            "Pacientes por grupo base", min_value=1.0, max_value=20.0, value=3.0
        )
        management_target = st.slider("Meta de gestión", 0.0, 1.0, 0.90, 0.05)
        standard_minutes = st.selectbox("Minutos estándar directa", [30, 40, 45, 60], index=0)
        indirect_minutes = st.number_input(
            "Minutos estándar indirecta", min_value=15, max_value=120, value=30
        )
        weeks_per_month = st.number_input(
            "Semanas equivalentes por mes", min_value=3.0, max_value=5.0, value=4.2
        )

    try:
        source = uploaded.getvalue() if uploaded else str(DEFAULT_DOTACION)
        dotacion = load_dotacion(source)
        quality = validation_report(dotacion)
    except Exception as error:
        st.error(f"No fue posible procesar el reporte: {error}")
        return

    plan = calculate_plan(
        dotacion,
        direct_pct,
        indirect_pct,
        nas_pct,
        group_pct,
        patients_per_group,
        management_target,
        standard_minutes,
        indirect_minutes,
        weeks_per_month,
    )

    with st.container():
        cols = st.columns(4)
        statuses = [
            ("1", "Reporte BUK recibido", "Carga automática"),
            ("2", "Validaciones ejecutadas", f"{int(quality['Hallazgos'].sum())} hallazgos"),
            ("3", "Planificación recalculada", datetime.now().strftime("%H:%M")),
            ("4", "Trazabilidad", "Versión 2026.1"),
        ]
        for col, (number, title, detail) in zip(cols, statuses):
            with col:
                st.markdown(
                    f'<div class="status"><b>{number}. {title}</b><br>'
                    f'<span class="small">{detail}</span></div>',
                    unsafe_allow_html=True,
                )

    st.caption(
        "Blue Prism: recepción y validación del archivo → motor de cálculo parametrizable → "
        "dashboard de revisión y aprobación."
    )

    with st.sidebar:
        st.subheader("Filtros")
        selected_institutes = st.multiselect(
            "Instituto", filtered_options(plan, "institute")
        )
        selected_areas = st.multiselect("Área", filtered_options(plan, "area"))
        selected_roles = st.multiselect("Cargo", filtered_options(plan, "role"))
        selected_months = st.multiselect(
            "Mes", [MONTHS[period] for period in MONTH_ORDER], default=[]
        )

    filtered = plan.copy()
    if selected_institutes:
        filtered = filtered[filtered["institute"].isin(selected_institutes)]
    if selected_areas:
        filtered = filtered[filtered["area"].isin(selected_areas)]
    if selected_roles:
        filtered = filtered[filtered["role"].isin(selected_roles)]
    if selected_months:
        filtered = filtered[filtered["month"].isin(selected_months)]

    annual = (
        filtered.groupby(["institute", "area", "person_id", "role"], as_index=False)
        .agg(
            weekly_hours=("weekly_hours", "mean"),
            contracted_hours=("contracted_hours", "sum"),
            direct_hours=("direct_hours", "sum"),
            indirect_hours=("indirect_hours", "sum"),
            nas_hours=("nas_hours", "sum"),
            direct_attentions=("direct_attentions", "sum"),
            indirect_attentions=("indirect_attentions", "sum"),
            total_attentions=("total_attentions", "sum"),
            management_target=("management_target", "sum"),
            foja=("foja", "mean"),
        )
    )
    summary = (
        filtered.groupby("institute", as_index=False)
        .agg(
            weekly_hours=("weekly_hours", "sum"),
            direct_hours=("direct_hours", "sum"),
            indirect_hours=("indirect_hours", "sum"),
            nas_hours=("nas_hours", "sum"),
            direct_attentions=("direct_attentions", "sum"),
            indirect_attentions=("indirect_attentions", "sum"),
            total_attentions=("total_attentions", "sum"),
            management_target=("management_target", "sum"),
            foja=("foja", "mean"),
        )
        .sort_values("total_attentions", ascending=False)
    )

    st.subheader("Vista ejecutiva")
    kpi = st.columns(5)
    total_people = annual["person_id"].nunique()
    total_attentions = int(filtered["total_attentions"].sum())
    target = int(filtered["management_target"].sum())
    direct_hours = filtered["direct_hours"].sum()
    contracted_hours = filtered["contracted_hours"].sum()
    metrics = [
        ("Profesionales", f"{total_people:,}", "con planificación activa"),
        ("Horas contratadas", format_hours(contracted_hours), "proyección seleccionada"),
        ("Atenciones planificadas", f"{total_attentions:,}", "directas + indirectas"),
        ("Meta de gestión", f"{target:,}", f"al {management_target:.0%}"),
        ("FOJA promedio", f"{direct_hours / contracted_hours:.1%}" if contracted_hours else "0,0%", "directa / contratada"),
    ]
    for col, (label, value, help_text) in zip(kpi, metrics):
        col.metric(label, value, help_text)

    tab_summary, tab_trend, tab_people, tab_quality = st.tabs(
        ["Consolidado por instituto", "Evolución mensual", "Profesionales", "Calidad y reglas"]
    )

    with tab_summary:
        if summary.empty:
            st.info("No hay registros para los filtros seleccionados.")
        else:
            chart_data = summary.set_index("institute")[
                ["direct_attentions", "indirect_attentions", "management_target"]
            ]
            st.bar_chart(chart_data)
            display_summary = summary.rename(
                columns={
                    "institute": "Instituto",
                    "weekly_hours": "Horas semanales",
                    "direct_hours": "Directa (h)",
                    "indirect_hours": "Indirecta (h)",
                    "nas_hours": "NAS (h)",
                    "direct_attentions": "Atenciones directas",
                    "indirect_attentions": "Atenciones indirectas",
                    "total_attentions": "Total planificado",
                    "management_target": "Meta de gestión",
                    "foja": "FOJA",
                }
            )
            display_summary["FOJA"] = display_summary["FOJA"].map(lambda value: f"{value:.1%}")
            st.dataframe(
                display_summary[
                    [
                        "Instituto",
                        "Horas semanales",
                        "Directa (h)",
                        "Indirecta (h)",
                        "NAS (h)",
                        "Atenciones directas",
                        "Atenciones indirectas",
                        "Total planificado",
                        "Meta de gestión",
                        "FOJA",
                    ]
                ],
                use_container_width=True,
                hide_index=True,
            )

    with tab_trend:
        trend = (
            filtered.groupby(["period_order", "month"], as_index=False)
            .agg(
                direct_attentions=("direct_attentions", "sum"),
                indirect_attentions=("indirect_attentions", "sum"),
                management_target=("management_target", "sum"),
            )
            .sort_values("period_order")
            .set_index("month")
        )
        st.line_chart(
            trend[["direct_attentions", "indirect_attentions", "management_target"]]
        )
        st.dataframe(trend.reset_index(), use_container_width=True, hide_index=True)

    with tab_people:
        search = st.text_input("Buscar por PersonaId, cargo o instituto")
        people = annual.copy()
        if search:
            mask = people.astype(str).apply(
                lambda column: column.str.contains(search, case=False, na=False)
            )
            people = people[mask.any(axis=1)]
        people = people.sort_values("total_attentions", ascending=False)
        people["foja"] = people["foja"].map(lambda value: f"{value:.1%}")
        st.dataframe(
            people.rename(
                columns={
                    "institute": "Instituto",
                    "area": "Área",
                    "person_id": "PersonaId",
                    "role": "Cargo",
                    "weekly_hours": "Horas semanales",
                    "direct_hours": "Directa (h)",
                    "indirect_hours": "Indirecta (h)",
                    "nas_hours": "NAS (h)",
                    "direct_attentions": "Atenciones directas",
                    "indirect_attentions": "Atenciones indirectas",
                    "total_attentions": "Total planificado",
                    "management_target": "Meta de gestión",
                    "foja": "FOJA",
                }
            ),
            use_container_width=True,
            hide_index=True,
        )

    with tab_quality:
        st.markdown("#### Resultado de validaciones del flujo")
        quality_view = quality.copy()
        quality_view["Estado"] = quality_view["Hallazgos"].map(
            lambda value: "OK" if value == 0 else "Revisar"
        )
        st.dataframe(quality_view, use_container_width=True, hide_index=True)
        st.markdown("#### Parámetros activos")
        st.json(
            {
                "atencion_directa_base": direct_pct,
                "atencion_indirecta_base": indirect_pct,
                "nas_base": nas_pct,
                "meta_gestion": management_target,
                "minutos_atencion_directa": standard_minutes,
                "minutos_atencion_indirecta": indirect_minutes,
                "semanas_equivalentes_mes": weeks_per_month,
                "regla_jornada": "44 h semanales hasta abril; 42 h desde mayo",
                "asignaciones_especiales": "pendiente de incorporar catálogo aprobado por DMN",
            }
        )


if __name__ == "__main__":
    main()
