import { useId, useState } from "react";
import { BarChart3 } from "lucide-react";
import { language } from "../_lib/i18n";
import { kindTitle, number, seriesFor, tr, type Dataset, type Panel } from "./model";

function Empty({ text }: { text: string }) {
  return <div className="dash-chart-empty"><BarChart3 size={22} aria-hidden="true"/><span>{text}</span></div>;
}

function DataTable({ dataset, columns }: { dataset: Dataset; columns: string[] }) {
  const indices = columns.map(column => dataset.columns.indexOf(column)).filter(index => index >= 0);
  return <div className="dash-table-wrap" tabIndex={0} role="region" aria-label={tr("Data table", "数据表")}>
    <table><thead><tr>{indices.map(index => <th key={index} scope="col">{dataset.columns[index]}</th>)}</tr></thead>
    <tbody>{dataset.rows.map((row, line) => <tr key={line}>{indices.map(index => <td key={index}>{typeof row[index] === "number" ? number(row[index]) : row[index] ?? "—"}</td>)}</tr>)}</tbody></table>
  </div>;
}

function Legend({ labels }: { labels: string[] }) {
  return <ul className="dash-legend">{labels.map((label, index) => <li key={index}><i className={`series-${index % 6}`}/>{label}</li>)}</ul>;
}

function Donut({ names, values, title }: { names: string[]; values: (number | null)[]; title: string }) {
  const positive = values.flatMap((value, index) => value !== null && value > 0 ? [{ name: names[index], value }] : []);
  const segments = positive.slice(0, 5);
  if (positive.length > 5) segments.push({ name: tr("Other", "其他"), value: positive.slice(5).reduce((sum, entry) => sum + entry.value, 0) });
  const total = segments.reduce((sum, entry) => sum + entry.value, 0);
  if (!total) return <Empty text={tr("No positive values to chart", "没有可绘制的正数值")}/>;
  const percentage = new Intl.NumberFormat(language() === "zh" ? "zh-CN" : "en", { style: "percent", maximumFractionDigits: 1 });
  let angle = 0;
  const stops = segments.map(({ value }, index) => {
    const start = angle;
    angle += value / total * 360;
    return `var(--series-${index}) ${start}deg ${angle}deg`;
  });
  return <div className="dash-donut-layout">
    <div className="dash-donut" role="img" aria-label={`${title} · ${number(total)}`} style={{ background: segments.length === 1 ? "var(--series-0)" : `conic-gradient(${stops.join(",")})` }}>
      <div><strong>{number(total, true)}</strong><span>{tr("Total", "合计")}</span></div>
    </div>
    <ul className="dash-donut-key">{segments.map(({ name, value }, index) => <li key={index} title={number(value)}>
      <i className={`series-${index}`}/><span>{name}</span><strong>{percentage.format(value / total)}</strong>
    </li>)}</ul>
  </div>;
}

function Cartesian({ panel, names, series }: { panel: Panel } & ReturnType<typeof seriesFor>) {
  const [active, setActive] = useState<number | null>(null);
  const fillId = useId();
  const numeric = series.flatMap(item => item.values.filter(value => value !== null));
  if (!numeric.length) return <Empty text={tr("No numeric data to chart", "没有可绘制的数值")}/>;
  const first = Math.min(0, ...numeric), last = Math.max(0, ...numeric);
  const stepSize = (last === first ? 1 : Math.max((last - first) / 4, 1e-9));
  const power = 10 ** Math.floor(Math.log10(stepSize));
  const step = ([1, 2, 2.5, 5, 10].find(value => value >= stepSize / power) ?? 10) * power;
  const low = Math.floor(first / step) * step;
  const high = Math.ceil((last || (first === 0 ? step : 0)) / step) * step;
  const width = 620, top = 10, left = 51, right = 607, bottom = 188;
  const band = (right - left) / names.length;
  const x = (index: number) => left + band * (index + .5);
  const y = (value: number) => bottom - (value - low) / (high - low) * (bottom - top);
  const baseline = y(0);
  const ticks = Array.from({ length: Math.round((high - low) / step) + 1 }, (_, index) => low + index * step);
  const spacing = Math.max(1, Math.ceil(names.length / 6));
  const bars = panel.kind === "bar";
  const barWidth = Math.min(30, band * .72 / series.length);
  const hovered = active === null || active >= names.length ? null : active;
  const single = names.length === 1;
  const xPoint = (index: number) => bars || single ? x(index) : left + (right - left) * index / (names.length - 1);

  return <>
    {series.length > 1 && <Legend labels={series.map(item => item.name)}/>}
    <div className="dash-plot" onPointerLeave={() => setActive(null)}>
      <svg viewBox={`0 0 ${width} 216`} role="img" aria-label={`${panel.title} · ${kindTitle(panel.kind)}`}
        onPointerMove={event => {
          const rect = event.currentTarget.getBoundingClientRect();
          const px = (event.clientX - rect.left) / rect.width * width;
          const index = bars || single ? Math.floor((px - left) / band) : Math.round((px - left) / (right - left) * (names.length - 1));
          setActive(px >= left && px <= right ? Math.max(0, Math.min(names.length - 1, index)) : null);
        }}>
        <defs>{series.map((_, index) => <linearGradient key={index} id={`${fillId}-${index}`} x2="0%" y2="100%">
          <stop offset="0%" stopColor={`var(--series-${index})`} stopOpacity=".32"/><stop offset="100%" stopColor={`var(--series-${index})`} stopOpacity=".04"/>
        </linearGradient>)}</defs>
        {ticks.map(value => <g key={value}><line className="dash-gridline" x1={left} x2={right} y1={y(value)} y2={y(value)}/><text x={left - 9} y={y(value) + 4} textAnchor="end">{number(value, true)}</text></g>)}
        {names.map((name, index) => index % spacing === 0 && <text key={index} x={xPoint(index)} y={bottom + 20} textAnchor={xPoint(index) > right - 25 ? "end" : xPoint(index) < left + 25 ? "start" : "middle"}>
          {name.length > 12 ? `${name.slice(0, 11)}…` : name}</text>)}
        {series.map(({ name, values }, index) => {
          const color = `var(--series-${index})`;
          if (bars) return <g key={name}>{values.map((value, position) => value !== null && <rect key={position} x={x(position) + (index - series.length / 2) * barWidth} y={Math.min(y(value), baseline)}
            width={barWidth * .88} height={Math.abs(y(value) - baseline)} rx={Math.min(3, barWidth / 4)} fill={color}/>)}</g>;
          const runs: { x: number; y: number }[][] = [];
          let run: { x: number; y: number }[] = [];
          values.forEach((value, position) => {
            if (value === null) { run = []; return; }
            if (!run.length) runs.push(run);
            run.push({ x: xPoint(position), y: y(value) });
          });
          return <g key={name}>{runs.map((points, part) => {
            const path = points.map(({ x: pointX, y: pointY }, p) => `${p ? "L" : "M"}${pointX},${pointY}`).join(" ");
            const ends = `L${points[points.length - 1].x},${baseline} L${points[0].x},${baseline} Z`;
            return <g key={part}>
              {panel.kind === "area" && <path d={`${path} ${ends}`} fill={`url(#${fillId}-${index})`}/>}
              <path d={path} stroke={color} strokeWidth="2.6" strokeLinejoin="round" fill="none" vectorEffect="non-scaling-stroke"/>
              {points.length <= 20 && points.map(point => <circle key={point.x} cx={point.x} cy={point.y} r="2.8" fill={color}/>)}
            </g>;
          })}</g>;
        })}
        {hovered !== null && <line className="dash-guide" x1={xPoint(hovered)} x2={xPoint(hovered)} y1={top} y2={bottom}/>}
      </svg>
      {hovered !== null && <div className={`dash-tooltip ${hovered >= names.length / 2 ? "on-left" : ""}`}>
        <strong>{names[hovered]}</strong>
        {series.map(({ name, values }, index) => <div key={name}><i className={`series-${index}`}/>{name}<b>{values[hovered] === null ? "—" : `${number(values[hovered])} ${panel.unit}`}</b></div>)}
      </div>}
    </div>
  </>;
}

export function Chart({ panel, dataset }: { panel: Panel; dataset?: Dataset }) {
  if (!dataset) return <Empty text={panel.dataset ? tr("Waiting for a dataset", "等待数据集") : tr("Choose a dataset in Edit layout", "请在编辑布局中选择数据集")}/>;
  if (!dataset.rows.length) return <Empty text={tr("This snapshot has no rows", "这个快照没有数据行")}/>;
  if (panel.kind === "table") return <DataTable dataset={dataset} columns={dataset.columns}/>;
  const { names, series } = seriesFor(panel, dataset);
  if (!series.length) return <Empty text={tr("Choose a numeric column in Edit layout", "请在编辑布局中选择数值列")}/>;
  if (panel.kind === "metric") {
    let last = series[0].values.length - 1;
    while (last >= 0 && series[0].values[last] === null) last--;
    if (last < 0) return <Empty text={tr("No numeric value", "没有数值")}/>;
    return <div className="dash-metric"><strong>{number(series[0].values[last]!)}</strong>{panel.unit && <span>{panel.unit}</span>}<small>{names[last]}</small></div>;
  }
  const displayColumns = [...new Set([panel.label, ...series.map(item => item.name)].filter(Boolean))];
  return <>
    {panel.kind === "donut" ? <Donut names={names} values={series[0].values} title={panel.title}/> :
      <Cartesian panel={panel} names={names} series={series}/>}
    <details className="dash-chart-data"><summary>{tr("View data", "查看数据")}</summary><DataTable dataset={dataset} columns={displayColumns}/></details>
  </>;
}
