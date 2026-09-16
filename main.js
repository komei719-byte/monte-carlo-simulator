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
  const maxDrawdowns = []; // 各試行の最大ドローダウン（割合 0.0〜1.0）を保持

  for (let i = 0; i < simulations; i++) {
    yearlyResults[0].push(initialCapital);
  }

  // 相関係数の境界値を保護 (-1 <= correlation <= 1)
  const safeCorr = Math.max(-1, Math.min(1, correlation));
  const corrScale = Math.sqrt(1 - safeCorr * safeCorr);

  for (let sim = 0; sim < simulations; sim++) {
    let currentTqqq = initialCapital * tqqqRatio;
    let currentGold = initialCapital * goldRatio;

    // 各資産の取得単価（簿価）を管理
    let costBasisTqqq = currentTqqq;
    let costBasisGold = currentGold;

    // ドローダウン計算用の最高資産額と最大ドローダウン初期化
    let peakValue = initialCapital;
    let maxDD = 0;

    for (let year = 1; year <= years; year++) {
      const z1 = generateNormalRandom();
      const z2 = generateNormalRandom();

      const zTqqq = z1;
      const zGold = safeCorr * z1 + corrScale * z2;

      // 算術平均リターンからのボラティリティドラッグ調整
      const rTqqq = (tqqqReturn - 0.5 * Math.pow(tqqqRisk, 2)) + tqqqRisk * zTqqq;
      const rGold = (goldReturn - 0.5 * Math.pow(goldRisk, 2)) + goldRisk * zGold;

      currentTqqq *= Math.exp(rTqqq);
      currentGold *= Math.exp(rGold);

      const totalBeforeRebalance = currentTqqq + currentGold;

      // 仮の目標配分額（税引前）
      const targetTqqqGross = totalBeforeRebalance * tqqqRatio;
      const targetGoldGross = totalBeforeRebalance * goldRatio;

      let tax = 0;

      // TQQQを売却して金を買い増す場合
      if (currentTqqq > targetTqqqGross) {
        const sellAmountGross = currentTqqq - targetTqqqGross;
        const profitRatio = (currentTqqq - costBasisTqqq) / currentTqqq;
        const taxableGain = sellAmountGross * Math.max(0, profitRatio);
        tax = taxableGain * taxRate;

        // 税引後の純資産額と最終ポジションの確定
        const netTotalPortfolio = totalBeforeRebalance - tax;
        const nextTqqq = netTotalPortfolio * tqqqRatio;
        const nextGold = netTotalPortfolio * goldRatio;

        // 【取得価額の正確な計算】
        costBasisTqqq *= (nextTqqq / currentTqqq);
        costBasisGold += (nextGold - currentGold);

        currentTqqq = nextTqqq;
        currentGold = nextGold;
      } 
      // 金を売却してTQQQを買い増す場合
      else if (currentGold > targetGoldGross) {
        const sellAmountGross = currentGold - targetGoldGross;
        const profitRatio = (currentGold - costBasisGold) / currentGold;
        const taxableGain = sellAmountGross * Math.max(0, profitRatio);
        tax = taxableGain * taxRate;

        // 税引後の純資産額と最終ポジションの確定
        const netTotalPortfolio = totalBeforeRebalance - tax;
        const nextTqqq = netTotalPortfolio * tqqqRatio;
        const nextGold = netTotalPortfolio * goldRatio;

        // 【取得価額の正確な計算】
        costBasisGold *= (nextGold / currentGold);
        costBasisTqqq += (nextTqqq - currentTqqq);

        currentTqqq = nextTqqq;
        currentGold = nextGold;
      }

      const totalPortfolio = currentTqqq + currentGold;
      yearlyResults[year].push(totalPortfolio);

      // --- 最大ドローダウン（MDD）の計算 ---
      if (totalPortfolio > peakValue) {
        peakValue = totalPortfolio;
      } else {
        const currentDD = (peakValue - totalPortfolio) / peakValue;
        if (currentDD > maxDD) {
          maxDD = currentDD;
        }
      }
    }

    maxDrawdowns.push(maxDD);
  }

  return { yearlyResults, maxDrawdowns };
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
            callback: value => '$' + Math.round(value).toLocaleString()
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

  const finalYearResults = yearlyResults[years];
  const finalMedian = percentiles.medians[years];
  const finalTop10 = percentiles.top10s[years];
  const finalBottom10 = percentiles.bottom10s[years];

  const lossCount = finalYearResults.filter(v => v < initialCapital).length;
  const lossProb = ((lossCount / simulations) * 100).toFixed(1);

  // --- 追加機能: 最大ドローダウン（MDD）の統計計算 ---
  const sortedMDD = [...maxDrawdowns].sort((a, b) => a - b);
  const mddMedian = (sortedMDD[Math.floor(simulations * 0.5)] * 100).toFixed(1);
  const countMDD50 = maxDrawdowns.filter(mdd => mdd >= 0.5).length;
  const probMDD50 = ((countMDD50 / simulations) * 100).toFixed(1);
  const countMDD70 = maxDrawdowns.filter(mdd => mdd >= 0.7).length;
  const probMDD70 = ((countMDD70 / simulations) * 100).toFixed(1);

  // UI要素が存在すれば描画・更新
  const elemMedian = document.getElementById('median-val');
  const elemTop10 = document.getElementById('top10-val');
  const elemBottom10 = document.getElementById('bottom10-val');
  const elemLoss = document.getElementById('loss-prob');

  if (elemMedian) elemMedian.innerText = `$${Math.round(finalMedian).toLocaleString()}`;
  if (elemTop10) elemTop10.innerText = `$${Math.round(finalTop10).toLocaleString()}`;
  if (elemBottom10) elemBottom10.innerText = `$${Math.round(finalBottom10).toLocaleString()}`;
  if (elemLoss) elemLoss.innerText = `${lossProb}%`;

  // MDD表示要素が存在する場合は設定
  const elemMddMedian = document.getElementById('mdd-median-val');
  const elemMdd50 = document.getElementById('mdd50-prob');
  const elemMdd70 = document.getElementById('mdd70-prob');

  if (elemMddMedian) elemMddMedian.innerText = `-${mddMedian}%`;
  if (elemMdd50) elemMdd50.innerText = `${probMDD50}%`;
  if (elemMdd70) elemMdd70.innerText = `${probMDD70}%`;

  renderChart(years, percentiles);
});