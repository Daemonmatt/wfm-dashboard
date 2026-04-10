import { useState, useMemo, useCallback } from 'react';
import { BarChart3, Upload, Beaker, Settings, Download, ChevronDown } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import FileUpload from './components/FileUpload';
import HeatmapTable from './components/HeatmapTable';
import MetricCard from './components/MetricCard';
import { WeeklyTotalChart, DayComparisonChart, HCOverlayChart } from './components/Charts';
import { parseData, buildArrivalPattern, generateSampleData, DAY_ORDER } from './lib/dataProcessing';
import { forecastArrivalPattern, FORECAST_MODELS } from './lib/forecasting';
import { computeHCTable, STAFFING_MODELS } from './lib/staffing';

function downloadCSV(table, filename) {
  if (!table?.length) return;
  const days = DAY_ORDER.filter(d => table[0][d] !== undefined);
  const header = ['Hour', ...days].join(',');
  const rows = table.map(r => [r.hour, ...days.map(d => r[d] ?? 0)].join(','));
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const TABS = ['Arrival Pattern', 'Forecasted Volume', 'HC Required', 'Visual Insights'];
const TAB_ICONS = ['📋', '🔮', '👥', '📈'];

export default function App() {
  const [records, setRecords] = useState(null);
  const [fileName, setFileName] = useState('');
  const [activeTab, setActiveTab] = useState(0);
  const [selectedTeam, setSelectedTeam] = useState('All Teams');
  const [forecastModel, setForecastModel] = useState('hw');
  const [staffingModel, setStaffingModel] = useState('erlang_c');
  const [compareDay, setCompareDay] = useState('Monday');
  const [paramsOpen, setParamsOpen] = useState(false);
  const [params, setParams] = useState({
    ahtSeconds: 300,
    serviceLevel: 0.80,
    targetAnswerTime: 30,
    shrinkage: 0.30,
    utilization: 0.75,
  });

  const handleDataLoaded = useCallback((rows, name) => {
    const result = parseData(rows);
    if (result.error) { alert(result.error); return; }
    setRecords(result.data);
    setFileName(name);
    setSelectedTeam('All Teams');
    setActiveTab(0);
  }, []);

  const handleSampleData = useCallback(() => {
    const sample = generateSampleData(8000, 90);
    setRecords(sample);
    setFileName('sample_data.csv');
    setSelectedTeam('All Teams');
    setActiveTab(0);
  }, []);

  const teams = useMemo(() => {
    if (!records) return [];
    return [...new Set(records.map(r => r.team))].sort();
  }, [records]);

  const filtered = useMemo(() => {
    if (!records) return [];
    return selectedTeam === 'All Teams' ? records : records.filter(r => r.team === selectedTeam);
  }, [records, selectedTeam]);

  const arrivalTable = useMemo(() => filtered.length ? buildArrivalPattern(filtered) : [], [filtered]);
  const forecastTable = useMemo(() => filtered.length ? forecastArrivalPattern(filtered, arrivalTable, forecastModel) : [], [filtered, arrivalTable, forecastModel]);
  const hcTable = useMemo(() => forecastTable.length ? computeHCTable(forecastTable, { model: staffingModel, ...params }) : [], [forecastTable, staffingModel, params]);

  const stats = useMemo(() => {
    if (!filtered.length) return {};
    const dates = filtered.map(r => r.created_at);
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));
    const uniqueDays = new Set(dates.map(d => d.toISOString().slice(0, 10))).size;
    return {
      total: filtered.length,
      days: uniqueDays,
      avgDaily: Math.round(filtered.length / Math.max(uniqueDays, 1)),
      range: `${minDate.toISOString().slice(0, 10)} → ${maxDate.toISOString().slice(0, 10)}`,
    };
  }, [filtered]);

  const availableDays = useMemo(() => DAY_ORDER.filter(d => arrivalTable[0]?.[d] !== undefined), [arrivalTable]);

  const updateParam = (key, value) => setParams(p => ({ ...p, [key]: value }));

  // ── No Data State ──
  if (!records) {
    return (
      <div className="min-h-screen bg-bg-dark">
        <Header />
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-text-main font-semibold mb-4 flex items-center gap-2">
                <Upload className="w-5 h-5 text-primary" /> Upload Your Data
              </h3>
              <FileUpload onDataLoaded={handleDataLoaded} />
            </div>
            <div>
              <h3 className="text-text-main font-semibold mb-4 flex items-center gap-2">
                <Beaker className="w-5 h-5 text-secondary" /> Or Try Sample Data
              </h3>
              <div className="bg-bg-card border border-secondary/20 rounded-xl p-8 text-center">
                <p className="text-text-sub text-sm mb-4">
                  Generate 8,000 realistic records across 90 days with Support, Sales, and Tech teams.
                </p>
                <button
                  onClick={handleSampleData}
                  className="bg-secondary hover:bg-secondary/80 text-white font-semibold px-6 py-3
                             rounded-lg transition-colors inline-flex items-center gap-2"
                >
                  <Beaker className="w-4 h-4" /> Generate Sample Data
                </button>
              </div>
            </div>
          </div>

          <div className="mt-8 bg-bg-card/50 border border-primary/10 rounded-xl p-6 text-center">
            <p className="text-text-sub text-sm">
              Your file must contain a <code className="bg-bg-surface px-1.5 py-0.5 rounded text-primary-light text-xs">created_at</code> column (datetime).
              Optionally include a <code className="bg-bg-surface px-1.5 py-0.5 rounded text-primary-light text-xs">team</code> column for filtering.
            </p>
            <div className="flex justify-center gap-6 mt-4 text-text-muted text-xs">
              <span>1️⃣ Arrival Pattern</span>
              <span>2️⃣ Forecasted Volume</span>
              <span>3️⃣ HC Required</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Dashboard ──
  return (
    <div className="min-h-screen bg-bg-dark">
      <Header />

      {/* Controls Bar */}
      <div className="max-w-[1600px] mx-auto px-6 mb-4">
        <div className="bg-bg-card border border-primary/10 rounded-xl p-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 items-end">
            {/* Team Filter */}
            <div>
              <label className="text-text-sub text-xs font-medium uppercase tracking-wider mb-1 block">Team</label>
              <select
                value={selectedTeam}
                onChange={e => setSelectedTeam(e.target.value)}
                className="w-full"
              >
                <option value="All Teams">All Teams</option>
                {teams.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {/* Forecast Model */}
            <div>
              <label className="text-text-sub text-xs font-medium uppercase tracking-wider mb-1 block">Forecast Model</label>
              <select
                value={forecastModel}
                onChange={e => setForecastModel(e.target.value)}
                className="w-full"
              >
                {Object.entries(FORECAST_MODELS).map(([label, key]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            {/* Staffing Model */}
            <div>
              <label className="text-text-sub text-xs font-medium uppercase tracking-wider mb-1 block">Staffing Model</label>
              <select
                value={staffingModel}
                onChange={e => setStaffingModel(e.target.value)}
                className="w-full"
              >
                {Object.entries(STAFFING_MODELS).map(([label, key]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            {/* File info */}
            <div className="text-text-sub text-xs">
              <span className="text-text-muted">File:</span> {fileName}
            </div>

            {/* New upload */}
            <div className="flex gap-2">
              <label className="bg-primary/20 hover:bg-primary/30 text-primary text-xs font-medium px-3 py-2
                                rounded-lg cursor-pointer transition-colors inline-flex items-center gap-1.5 flex-1 justify-center">
                <Upload className="w-3.5 h-3.5" /> New Upload
                <input type="file" accept=".csv,.xlsx,.xls" className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const name = f.name.toLowerCase();
                    if (name.endsWith('.csv')) {
                      Papa.parse(f, { header: true, skipEmptyLines: true, complete: r => handleDataLoaded(r.data, f.name) });
                    } else {
                      const reader = new FileReader();
                      reader.onload = ev => {
                        const wb = XLSX.read(ev.target.result, { type: 'array', cellDates: true });
                        handleDataLoaded(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]), f.name);
                      };
                      reader.readAsArrayBuffer(f);
                    }
                  }}
                />
              </label>
              <button
                onClick={handleSampleData}
                className="bg-secondary/20 hover:bg-secondary/30 text-secondary text-xs font-medium px-3 py-2
                           rounded-lg transition-colors inline-flex items-center gap-1.5"
              >
                <Beaker className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Parameters accordion */}
          <div className="mt-3 border-t border-bg-surface/50 pt-3">
            <button
              onClick={() => setParamsOpen(!paramsOpen)}
              className="flex items-center gap-2 text-text-sub text-xs hover:text-text-main transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Staffing Parameters</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${paramsOpen ? 'rotate-180' : ''}`} />
            </button>
            {paramsOpen && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-3">
                <div>
                  <label className="text-text-muted text-[10px] uppercase tracking-wider block mb-1">AHT (seconds)</label>
                  <input type="number" value={params.ahtSeconds} min={10} max={7200} step={10}
                    onChange={e => updateParam('ahtSeconds', +e.target.value)} className="w-full" />
                </div>
                <div>
                  <label className="text-text-muted text-[10px] uppercase tracking-wider block mb-1">Service Level</label>
                  <input type="range" min={50} max={100} value={Math.round(params.serviceLevel * 100)}
                    onChange={e => updateParam('serviceLevel', +e.target.value / 100)} className="w-full" />
                  <span className="text-text-sub text-xs">{Math.round(params.serviceLevel * 100)}%</span>
                </div>
                <div>
                  <label className="text-text-muted text-[10px] uppercase tracking-wider block mb-1">Answer Time (s)</label>
                  <input type="number" value={params.targetAnswerTime} min={5} max={600} step={5}
                    onChange={e => updateParam('targetAnswerTime', +e.target.value)} className="w-full" />
                </div>
                <div>
                  <label className="text-text-muted text-[10px] uppercase tracking-wider block mb-1">Shrinkage</label>
                  <input type="range" min={0} max={60} value={Math.round(params.shrinkage * 100)}
                    onChange={e => updateParam('shrinkage', +e.target.value / 100)} className="w-full" />
                  <span className="text-text-sub text-xs">{Math.round(params.shrinkage * 100)}%</span>
                </div>
                <div>
                  <label className="text-text-muted text-[10px] uppercase tracking-wider block mb-1">Utilization</label>
                  <input type="range" min={40} max={100} value={Math.round(params.utilization * 100)}
                    onChange={e => updateParam('utilization', +e.target.value / 100)} className="w-full" />
                  <span className="text-text-sub text-xs">{Math.round(params.utilization * 100)}%</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="max-w-[1600px] mx-auto px-6 mb-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard value={stats.total?.toLocaleString()} label="Total Records" />
          <MetricCard value={stats.days} label="Days of Data" />
          <MetricCard value={stats.avgDaily?.toLocaleString()} label="Avg Daily Volume" />
          <MetricCard value={stats.range} label="Date Range" />
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-[1600px] mx-auto px-6 mb-4">
        <div className="flex gap-1 bg-bg-card rounded-xl p-1.5 overflow-x-auto">
          {TABS.map((tab, i) => (
            <button
              key={tab}
              onClick={() => setActiveTab(i)}
              className={`flex-1 min-w-[140px] px-4 py-2.5 rounded-lg text-sm font-medium transition-all
                ${activeTab === i
                  ? 'bg-primary text-white shadow-lg'
                  : 'text-text-sub hover:text-text-main hover:bg-bg-surface/50'
                }`}
            >
              {TAB_ICONS[i]} {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-[1600px] mx-auto px-6 pb-12">
        {activeTab === 0 && (
          <TabPanel>
            <InfoBox>
              Each cell shows the <strong>average number of contacts</strong> arriving in that hour on
              that day of the week, computed from the <code>created_at</code> column.
            </InfoBox>
            <HeatmapTable data={arrivalTable} title="📋 Table 1 — Hourly Volume Arrival Pattern (Average)" palette="blue" />
            <div className="mt-4 flex justify-end">
              <DownloadBtn onClick={() => downloadCSV(arrivalTable, 'arrival_pattern.csv')} />
            </div>
          </TabPanel>
        )}

        {activeTab === 1 && (
          <TabPanel>
            <InfoBox>
              Forecasted hourly volume per day of week using <strong>{Object.keys(FORECAST_MODELS).find(k => FORECAST_MODELS[k] === forecastModel)}</strong>.
              The model is fitted on the full continuous hourly time series, then reshaped into the Hour × Day format.
            </InfoBox>
            <HeatmapTable data={forecastTable} title="🔮 Table 2 — Forecasted Volume" palette="orange" />
            <div className="mt-4 flex justify-end">
              <DownloadBtn onClick={() => downloadCSV(forecastTable, 'forecasted_volume.csv')} />
            </div>
          </TabPanel>
        )}

        {activeTab === 2 && (
          <TabPanel>
            <InfoBox>
              Headcount required to handle the forecasted volume using <strong>
              {Object.keys(STAFFING_MODELS).find(k => STAFFING_MODELS[k] === staffingModel)}</strong>.
              {staffingModel === 'erlang_c'
                ? ` AHT: ${params.ahtSeconds}s | SL: ${Math.round(params.serviceLevel*100)}% | Answer: ${params.targetAnswerTime}s | Shrinkage: ${Math.round(params.shrinkage*100)}%`
                : ` AHT: ${params.ahtSeconds}s | Utilization: ${Math.round(params.utilization*100)}% | Shrinkage: ${Math.round(params.shrinkage*100)}%`
              }
            </InfoBox>
            <HeatmapTable data={hcTable} title="👥 Table 3 — Headcount Required" palette="green" format="int" />
            <div className="mt-4 flex justify-end">
              <DownloadBtn onClick={() => downloadCSV(hcTable, 'hc_required.csv')} />
            </div>
          </TabPanel>
        )}

        {activeTab === 3 && (
          <TabPanel>
            <div className="grid md:grid-cols-2 gap-6 mb-8">
              <div className="bg-bg-card rounded-xl p-5 border border-primary/10">
                <WeeklyTotalChart data={arrivalTable} title="Average Daily Volume" color="#3B82F6" />
              </div>
              <div className="bg-bg-card rounded-xl p-5 border border-accent/10">
                <WeeklyTotalChart data={forecastTable} title="Forecasted Daily Volume" color="#F59E0B" />
              </div>
            </div>

            <div className="bg-bg-card rounded-xl p-5 border border-primary/10 mb-8">
              <div className="mb-4">
                <label className="text-text-sub text-xs uppercase tracking-wider mr-3">Compare Day:</label>
                <select value={compareDay} onChange={e => setCompareDay(e.target.value)}>
                  {availableDays.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <DayComparisonChart arrival={arrivalTable} forecast={forecastTable} day={compareDay} />
            </div>

            <div className="bg-bg-card rounded-xl p-5 border border-success/10">
              <HCOverlayChart hcTable={hcTable} />
            </div>
          </TabPanel>
        )}
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="bg-gradient-to-r from-bg-dark via-[#1E3A5F] to-bg-surface border-b border-primary/20 px-6 py-5 mb-6">
      <div className="max-w-[1600px] mx-auto flex items-center gap-3">
        <BarChart3 className="w-8 h-8 text-primary" />
        <div>
          <h1 className="text-xl font-bold text-text-main">WFM Arrival Pattern, Forecast & Staffing Dashboard</h1>
          <p className="text-text-sub text-sm">Upload data with a <code className="text-primary-light text-xs">created_at</code> column to analyse hourly arrival patterns, forecast volume, and calculate headcount.</p>
        </div>
      </div>
    </div>
  );
}

function TabPanel({ children }) {
  return <div className="bg-bg-card border border-primary/10 rounded-xl p-6">{children}</div>;
}

function InfoBox({ children }) {
  return (
    <div className="bg-primary/5 border border-primary/15 rounded-lg px-4 py-3 text-text-sub text-sm mb-5">
      {children}
    </div>
  );
}

function DownloadBtn({ onClick }) {
  return (
    <button onClick={onClick}
      className="bg-primary/20 hover:bg-primary/30 text-primary text-xs font-medium px-4 py-2
                 rounded-lg transition-colors inline-flex items-center gap-1.5">
      <Download className="w-3.5 h-3.5" /> Download CSV
    </button>
  );
}
