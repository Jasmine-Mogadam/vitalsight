import { useState } from 'react';
import { API_BASE } from '../lib/api';

export default function SyntheticDataPage() {
  const [data, setData] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [count, setCount] = useState(20);

  const generate = async () => {
    setGenerating(true);
    try {
      const response = await fetch(`${API_BASE}/api/generate-synthetic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count }),
      });
      const result = await response.json();
      setData(result.data);
    } catch {
      setData(null);
    } finally {
      setGenerating(false);
    }
  };

  const downloadCSV = () => {
    if (!data) return;
    const headers = ['age', 'gender', 'heartRate', 'breathingRate', 'stressLevel', 'hrv', 'spo2', 'skinTone', 'scenario', 'label'];
    const csv = [headers.join(','), ...data.map((row) => headers.map((header) => `"${row[header] ?? ''}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'vitalsight_synthetic_data.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page-shell">
      <section className="panel">
        <p className="eyebrow">Synthetic data</p>
        <h1>Generate labeled vitals records</h1>
        <div className="filter-row">
          <input type="number" min="5" max="100" value={count} onChange={(e) => setCount(Number(e.target.value))} />
          <button className="primary-btn" onClick={generate} type="button">{generating ? 'Generating...' : 'Generate dataset'}</button>
          {data && <button className="secondary-btn" onClick={downloadCSV} type="button">Download CSV</button>}
        </div>
        {data ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Age</th>
                  <th>Gender</th>
                  <th>HR</th>
                  <th>BR</th>
                  <th>Stress</th>
                  <th>HRV</th>
                  <th>SpO2</th>
                  <th>Scenario</th>
                  <th>Label</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row, index) => (
                  <tr key={`${row.scenario}-${index}`}>
                    <td>{row.age}</td>
                    <td>{row.gender}</td>
                    <td>{row.heartRate}</td>
                    <td>{row.breathingRate}</td>
                    <td>{row.stressLevel}</td>
                    <td>{row.hrv}</td>
                    <td>{row.spo2}%</td>
                    <td>{row.scenario}</td>
                    <td><span className={`label-badge ${row.label}`}>{row.label}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">Generate a dataset to create synthetic patient vitals with labeled scenarios.</div>
        )}
      </section>
    </div>
  );
}
