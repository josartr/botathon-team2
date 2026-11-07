# Cada hora cuenta

MVP de planificación asistencial para el desafío Botathon 2026. La aplicación carga el reporte anonimizado de dotación, valida su estructura, aplica reglas editables y entrega una vista ejecutiva nacional con profundización por instituto, área, cargo y profesional.

## Ejecutar localmente

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
streamlit run app.py
```

La aplicación usa `Nac-Base-contratos-x-mes.csv` como dataset inicial. También permite cargar otro CSV BUK desde la barra lateral, que representa el archivo depositado por Blue Prism después de su recepción y validación.

## Flujo propuesto con Blue Prism

1. Blue Prism recibe el reporte BUK/SIC desde la carpeta o buzón definido.
2. Valida nombre, columnas, filas incompletas y duplicados; registra la versión y los hallazgos.
3. Deposita el archivo validado en el punto de entrada de la aplicación.
4. El motor recalcula la planificación con parámetros vigentes.
5. El equipo central revisa el consolidado, filtra el detalle y aprueba la versión.

La integración está desacoplada: el MVP funciona con carga manual para la demo, pero el mismo punto de entrada puede ser automatizado por un proceso Blue Prism.

## Alcance del cálculo

- Horas contratadas mensuales a partir de horas semanales y semanas equivalentes parametrizadas.
- Distribución directa, indirecta y NAS editable desde la interfaz.
- Regla diferenciada para cargos de dirección, jefatura y coordinación.
- Atención grupal por especialidad con porcentaje y pacientes por grupo.
- Atenciones directas, indirectas, total planificado, meta al 90% y FOJA.
- Controles de calidad para filas incompletas, horas inválidas, duplicados y especialidades faltantes.

Los parámetros de asignaciones especiales, feriados regionales, vacaciones, licencias y excepciones multi-instituto quedan como siguiente iteración del MVP y deben conectarse al catálogo aprobado por la Dirección Médica Nacional.

## Datos

Los archivos incluidos son ficticios y anonimizados. No deben reemplazarse por datos personales reales sin incorporar control de acceso, trazabilidad y políticas de retención.
