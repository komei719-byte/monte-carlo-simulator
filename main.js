// Chart.js のインスタンス保持用変数
let myChart = null;

// 1. ボックス＝ミュラー法による標準正規乱数生成器
function generateNormalRandom() {
  let u1 = Math.random();
  let u2 = Math.random();
  while (u1 === 0) u1 = Math.random();
  while (u2 === 0) u2 = Math.random();
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

// 2. モンテカルロシミュレーションのメイン処理
function runMonteCarlo(params) {
  const {
    initialCapital, years, simulations,
    tqqqRatio, goldRatio,
    tqqqReturn, tqqqRisk,
    goldReturn, goldRisk,
    correlation, taxRate
  } = params;

  const yearlyResults = Array.from({ length: years + 1 }, () => []);

  for (let i = 0; i < simulations; i++) {
    yearlyResults[0].push(initialCapital);
  }

  for (let sim = 0; sim < simulations; sim++) {
    let currentTqqq = initialCapital * tqqqRatio;
    let currentGold = initialCapital * goldRatio;

    // 各資産の取得単価（簿価）を管理
    let costBasisTqqq = currentTqqq;
    let costBasisGold = currentGold;

    for (let year = 1; year <= years; year++) {
      const z1 = generateNormalRandom();
      const z2 = generateNormalRandom();

      const zTqqq = z1;
      const zGold = correlation * z1 + Math.sqrt(1 - correlation * correlation) * z2;

      const rTqqq = (tqqqReturn - 0.5 * Math.pow(tqqqRisk, 2)) + tqqqRisk * zTqqq;
      const rGold = (goldReturn - 0.5 * Math.pow(goldRisk, 2)) + goldRisk * zGold;

      currentTqqq *= Math.exp(rTqqq);
      currentGold *= Math.exp(rGold);

      const totalPortfolioBeforeRebalance = currentTqqq + currentGold;

      // 目標配分額
      const targetTqqq = totalPortfolioBeforeRebalance * tqqqRatio;
      const targetGold = totalPortfolioBeforeRebalance * goldRatio;

      // リバランスによる売却と課税の処理
      // TQQQを売却して金を買い増す場合
      if (currentTqqq > targetTqqq) {
        const sellAmount = currentTqqq - targetTqqq;
        const gainRatio = Math.max(0, (currentTqqq - costBasisTqqq) / currentTqqq);
        const taxableGain = sellAmount * gainRatio;
        const tax = taxableGain * taxRate;

        currentTqqq = targetTqqq;
        currentGold = targetGold - tax; // 納税分だけポートフォリオ全体が減少
        costBasisTqqq -= (sellAmount * (1 - gainRatio)); // 減った分だけ取得単価も減少
        costBasisGold += (sellAmount - tax); // 買った分を取得単価に加算
      } 
      // 金を売却してTQQQを買い増す場合
      else if (currentGold > targetGold) {
        const sellAmount = currentGold - targetGold;
        const gainRatio = Math.max(0, (currentGold - costBasisGold) / currentGold);
        const taxableGain = sellAmount * gainRatio;
        const tax = taxableGain * taxRate;

        currentGold = targetGold;
        currentTqqq = targetTqqq - tax;
        costBasisGold -= (sellAmount * (1 - gainRatio));
        costBasisTqqq += (sellAmount - tax);
      }

      const totalPortfolio = currentTqqq + currentGold;
      yearlyResults[year].push(totalPortfolio);
    }
  }

  return yearlyResults;
}

// 3. パーセンタイル（10%, 50%, 90%）の集計計算
function calculatePercentiles(yearlyResults, years) {
  const medians = [];
  const top10s = [];
  const bottom10s = [];

  for (let year = 0; year <= years; year++) {
    const sorted = [...yearlyResults[year]].sort((a, b) => a - b);
    const count = sorted.length;

    bottom10s.push(sorted[Math.floor(count * 0.1)]);
    medians.push(sorted[Math.floor(count * 0.5)]);
    top10s.push(sorted[Math.floor(count * 0.9)]);
  }

  return { medians, top10s, bottom10s };
}

// 4. Chart.js によるグラフ描画
function renderChart(years, percentiles) {
  const ctx = document.getElementById('simChart').getContext('2d');
  const labels = Array.from({ length: years + 1 }, (_, i) => `${i}年目`);

  if (myChart) {
    myChart.destroy();
  }

  myChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: '上位 10% (好調)',
          data: percentiles.top10s,
          borderColor: 'rgba(40, 167, 69, 1)',
          backgroundColor: 'rgba(40, 167, 69, 0.1)',
          borderDash: [5, 5],
          fill: false
        },
        {
          label: '中央値 (50%)',
          data: percentiles.medians,
          borderColor: 'rgba(0, 102, 204, 1)',
          backgroundColor: 'rgba(0, 102, 204, 0.2)',
          borderWidth: 3,
          fill: false
        },
        {
          label: '下位 10% (不調)',
          data: percentiles.bottom10s,
          borderColor: 'rgba(220, 53, 69, 1)',
          backgroundColor: 'rgba(220, 53, 69, 0.1)',
          borderDash: [5, 5],
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      scales: {
        y: {
          title: { display: true, text: '資産額 ($)' },
          ticks: {
            callback: value => '$' + value.toLocaleString()
          }
        },
        x: {
          title: { display: true, text: '経過年数' }
        }
      }
    }
  });
}

// 5. フォーム送信時のメインイベントハンドラ
document.getElementById('sim-form').addEventListener('submit', function (e) {
  e.preventDefault();

  const tqqqPercent = parseFloat(document.getElementById('tqqqRatio').value);
  const goldPercent = parseFloat(document.getElementById('goldRatio').value);

  // 追加要件①：資産配分が100%になるかチェック（許容誤差 0.01%）
  if (Math.abs((tqqqPercent + goldPercent) - 100) > 0.01) {
    alert(`資産配分の合計が100%になるように調整してください。（現在の合計: ${tqqqPercent + goldPercent}%）`);
    return;
  }

  const initialCapital = parseFloat(document.getElementById('initialCapital').value);
  const years = parseInt(document.getElementById('years').value);
  const simulations = parseInt(document.getElementById('simulations').value);

  // 追加要件②：税率（日本の譲渡所得税率 20.315% を適用）
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

  const yearlyResults = runMonteCarlo(params);
  const percentiles = calculatePercentiles(yearlyResults, years);

  const finalYearResults = yearlyResults[years];
  const finalMedian = percentiles.medians[years];
  const finalTop10 = percentiles.top10s[years];
  const finalBottom10 = percentiles.bottom10s[years];

  const lossCount = finalYearResults.filter(v => v < initialCapital).length;
  const lossProb = ((lossCount / simulations) * 100).toFixed(1);

  document.getElementById('median-val').innerText = `$${Math.round(finalMedian).toLocaleString()}`;
  document.getElementById('top10-val').innerText = `$${Math.round(finalTop10).toLocaleString()}`;
  document.getElementById('bottom10-val').innerText = `$${Math.round(finalBottom10).toLocaleString()}`;
  document.getElementById('loss-prob').innerText = `${lossProb}%`;

  renderChart(years, percentiles);
});