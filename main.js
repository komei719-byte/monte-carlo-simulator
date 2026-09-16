// 5. フォーム送信時のメインイベントハンドラ
document.getElementById('sim-form').addEventListener('submit', function (e) {
  e.preventDefault();

  const tqqqPercent = parseFloat(document.getElementById('tqqqRatio').value);
  const goldPercent = parseFloat(document.getElementById('goldRatio').value);

  if (Math.abs((tqqqPercent + goldPercent) - 100) > 0.01) {
    alert(`資産配分の合計が100%になるように調整してください。（現在の合計: ${tqqqPercent + goldPercent}%）`);
    return;
  }

  const initialCapital = parseFloat(document.getElementById('initialCapital').value);
  const years = parseInt(document.getElementById('years').value);
  const simulations = parseInt(document.getElementById('simulations').value);

  const taxRate = 0.20315;

  const params = {
    initialCapital,
    years,
    simulations,
    tqqqRatio: tqqqPercent / 100,
    goldRatio: goldPercent / 100,
    tqqqReturn: parseFloat(document.getElementById('tqqqReturn').value) / 100,
    tqqqRisk: parseFloat(document.getElementById('tqqqRisk').value) / 100,
    goldReturn: parseFloat(document.getElementById('goldReturn').value) / 100,
    goldRisk: parseFloat(document.getElementById('goldRisk').value) / 100,
    correlation: parseFloat(document.getElementById('correlation').value),
    taxRate: taxRate
  };

  const { yearlyResults, maxDrawdowns } = runMonteCarlo(params);
  const percentiles = calculatePercentiles(yearlyResults, years);

  // 1. 資産額サマリーの計算
  const finalYearResults = yearlyResults[years];
  const finalMedian = percentiles.medians[years];
  const finalTop10 = percentiles.top10s[years];
  const finalBottom10 = percentiles.bottom10s[years];

  const lossCount = finalYearResults.filter(v => v < initialCapital).length;
  const lossProb = ((lossCount / simulations) * 100).toFixed(1);

  // 2. 最大ドローダウン（MDD）の統計計算
  const sortedMDD = [...maxDrawdowns].sort((a, b) => a - b);
  const mddMedian = (sortedMDD[Math.floor(simulations * 0.5)] * 100).toFixed(1);
  const countMDD50 = maxDrawdowns.filter(mdd => mdd >= 0.5).length;
  const probMDD50 = ((countMDD50 / simulations) * 100).toFixed(1);
  const countMDD70 = maxDrawdowns.filter(mdd => mdd >= 0.7).length;
  const probMDD70 = ((countMDD70 / simulations) * 100).toFixed(1);

  // 3. UIのテキスト一括更新
  document.getElementById('median-val').innerText = `$${Math.round(finalMedian).toLocaleString()}`;
  document.getElementById('top10-val').innerText = `$${Math.round(finalTop10).toLocaleString()}`;
  document.getElementById('bottom10-val').innerText = `$${Math.round(finalBottom10).toLocaleString()}`;
  document.getElementById('loss-prob').innerText = `${lossProb}%`;

  // 追加したMDD指標の出力
  if (document.getElementById('mdd-median-val')) {
    document.getElementById('mdd-median-val').innerText = `-${mddMedian}%`;
  }
  if (document.getElementById('mdd50-prob')) {
    document.getElementById('mdd50-prob').innerText = `${probMDD50}%`;
  }
  if (document.getElementById('mdd70-prob')) {
    document.getElementById('mdd70-prob').innerText = `${probMDD70}%`;
  }

  // 4. グラフを描画
  renderChart(years, percentiles);
});